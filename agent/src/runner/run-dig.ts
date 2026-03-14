import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { resolveRuntimeConfig } from '../config/env.js'
import {
  ensureDir,
  loadPreviewsIncremental,
  writeUtf8
} from '../core/fs-io.js'
import { createLeadFile } from '../tools/investigative/create-lead-file.js'
import { toRelative } from '../core/paths.js'
import { OpenRouterClient } from '../llm/openrouter-client.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'
import {
  buildDigSystemPrompt,
  buildDigIncrementalPrompt,
  buildDigLinesPrompt,
  buildDigRankAndComparePrompt,
  type DigComparisonResult,
  type DigIncrementalConclusion,
  type DigLinesResult
} from '../prompts/dig.js'
import {
  buildResponseLanguageInstruction,
  resolveResponseLanguageForPrompt
} from '../core/language.js'
import {
  formatContractErrors,
  parseStrictJson,
  validateDigComparisonPayload,
  validateDigIncrementalPayload,
  validateDigLinesPayload
} from '../core/json-contract.js'
import {
  buildCritiqueRepairSystemPrompt,
  buildCritiqueRepairUserPrompt
} from '../prompts/critique-repair.js'
import { type SuggestedLeadState } from '../core/deep-dive-session.js'
import { createSession } from '../core/deep-dive-session-store.js'
import { similarityScore } from '../tools/document-processing/standard/dedup/fuzzy-match.js'

export interface RunDigOptions {
  model?: string
  responseLanguage?: string
  enablePev?: boolean
  selfRepairEnabled?: boolean
  selfRepairMaxRounds?: number
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
}

async function loadExistingLeadsMarkdown(leadsDir: string): Promise<string> {
  let entries: Dirent[]
  try {
    entries = await readdir(leadsDir, { withFileTypes: true })
  } catch {
    return ''
  }
  const lines: string[] = []
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    const leadPath = path.join(leadsDir, e.name)
    try {
      const content = await readFile(leadPath, 'utf8')
      const excerpt = content.length > 700 ? `${content.slice(0, 700)}...` : content
      lines.push(`### ${e.name}\n${excerpt}\n`)
    } catch {
      lines.push(`### ${e.name}\n(lead inacessivel)\n`)
    }
  }
  return lines.join('\n---\n\n')
}

export async function runDig(options: RunDigOptions = {}): Promise<void> {
  const runtime = await resolveRuntimeConfig({
    ...(options.model ? { model: options.model } : {}),
    ...(options.responseLanguage ? { responseLanguage: options.responseLanguage } : {}),
    ...(typeof options.enablePev === 'boolean' ? { enablePev: options.enablePev } : {}),
    ...(typeof options.selfRepairEnabled === 'boolean'
      ? { selfRepairEnabled: options.selfRepairEnabled }
      : {}),
    ...(typeof options.selfRepairMaxRounds === 'number'
      ? { selfRepairMaxRounds: options.selfRepairMaxRounds }
      : {})
  })
  await ensureDir(runtime.paths.outputDir)
  await ensureDir(runtime.paths.eventsDir)
  await ensureDir(runtime.paths.reportsDir)

  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'deep-dive',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))

  feedback.stepStart('dig-start', 'Iniciando deep-dive (escavacao aprofundada de leads)...')
  feedback.stepComplete('dig-start')
  feedback.stepStart('dig-load', `Carregando previews de ${toRelative(runtime.paths.projectRoot, runtime.paths.sourceArtifactsDir)}`)

  const { previews } = await loadPreviewsIncremental(
    runtime.paths.sourceArtifactsDir,
    runtime.paths.sourceDir
  )

  if (previews.length === 0) {
    throw new Error(
      `Nenhum preview encontrado em ${runtime.paths.sourceArtifactsDir}. Verifique se existem pastas com preview.md em lab/agent/filesystem/source/.artifacts.`
    )
  }

  feedback.stepComplete('dig-load', `${previews.length} preview(s) carregado(s)`)

  for (const p of previews) {
    feedback.sourceConsulted?.(p.documentName, p.documentName)
  }

  feedback.stepStart('dig-incremental', 'Analise incremental (um preview por vez)...')

  const client = new OpenRouterClient(runtime.apiKey)
  const responseLanguage = resolveResponseLanguageForPrompt({
    mode: runtime.responseLanguage,
    fallback: runtime.defaultResponseLanguage
  })
  const digSystemPrompt = buildDigSystemPrompt(buildResponseLanguageInstruction(responseLanguage))
  let accumulatedConclusions: DigIncrementalConclusion | undefined

  for (let i = 0; i < previews.length; i += 1) {
    const p = previews[i]!
    feedback.stepStart(`dig-doc-${i}`, `Documento ${i + 1}/${previews.length}: ${p.documentName}`)
    const conclusion = await requestStrictDigPayload({
      client,
      model: runtime.model,
      systemPrompt: digSystemPrompt,
      userPrompt: buildDigIncrementalPrompt(accumulatedConclusions, p.content, p.documentName),
      selfRepairEnabled: runtime.selfRepairEnabled,
      selfRepairMaxRounds: runtime.selfRepairMaxRounds,
      feedback,
      contractName: 'dig.incremental',
      hardRules: [
        'Return one JSON object only.',
        'Required keys: summary, keyFindings, hypotheses, gaps.',
        'All lists must contain only non-empty strings.'
      ],
      validator: validateDigIncrementalPayload
    })
    feedback.stepComplete(`dig-doc-${i}`)
    accumulatedConclusions = conclusion
  }

  feedback.stepComplete('dig-incremental', 'Analise incremental concluida')
  feedback.stepStart('dig-lines', 'Gerando linhas investigativas a partir das conclusoes...')

  if (!accumulatedConclusions) {
    throw new Error('Falha ao consolidar conclusoes incrementais do dig.')
  }

  const suggestedLines = await requestStrictDigPayload({
    client,
    model: runtime.model,
    systemPrompt: digSystemPrompt,
    userPrompt: buildDigLinesPrompt(accumulatedConclusions),
    selfRepairEnabled: runtime.selfRepairEnabled,
    selfRepairMaxRounds: runtime.selfRepairMaxRounds,
    feedback,
    contractName: 'dig.lines',
    hardRules: [
      'Return one JSON object only.',
      'Required key: lines (array).',
      'Each line requires title, description, rank, rationale.'
    ],
    validator: validateDigLinesPayload
  })

  feedback.stepComplete('dig-lines')
  feedback.stepStart('dig-rank', 'Comparando com leads existentes e ranqueando top 3...')

  const existingLeads = await loadExistingLeadsMarkdown(runtime.paths.leadsDir)
  const existingMarkdown = existingLeads
  let finalResult = await requestStrictDigPayload({
    client,
    model: runtime.model,
    systemPrompt: digSystemPrompt,
    userPrompt: buildDigRankAndComparePrompt(suggestedLines, existingMarkdown),
    selfRepairEnabled: runtime.selfRepairEnabled,
    selfRepairMaxRounds: runtime.selfRepairMaxRounds,
    feedback,
    contractName: 'dig.comparison',
    hardRules: [
      'Return one JSON object only.',
      'topLines must contain 1-3 items with title, description, differentiation and rank.',
      'recommendation must be a one-sentence next step.',
      'overlapNotes must be a string array.'
    ],
    validator: validateDigComparisonPayload
  })
  if (runtime.selfRepairEnabled && runtime.selfRepairMaxRounds > 0) {
    const repaired = await client.chatText({
      model: runtime.model,
      system: buildCritiqueRepairSystemPrompt(),
      user: buildCritiqueRepairUserPrompt({
        contractName: 'dig.comparison',
        hardRules: [
          'Preserve semantics while improving contract quality.',
          'Keep recommendation grounded in topLines and overlapNotes.',
          'Return JSON object only.'
        ],
        inputJson: JSON.stringify(finalResult)
      }),
      temperature: 0.05
    })
    const parsed = parseStrictJson(repaired)
    if (!parsed.ok) {
      throw new Error(`[dig.comparison] self-repair produced invalid JSON: ${formatContractErrors(parsed.errors)}`)
    }
    const validated = validateDigComparisonPayload(parsed.value)
    if (!validated.ok) {
      throw new Error(
        `[dig.comparison] self-repair produced invalid contract: ${formatContractErrors(validated.errors)}`
      )
    }
    finalResult = validated.value
  }

  feedback.stepComplete('dig-rank', 'Deep-dive concluido')

  const finalText = renderDigMarkdownReport({
    accumulatedConclusions,
    suggestedLines,
    finalResult
  })

  const reportContent = [
    '# Deep Dive — Linhas investigativas sugeridas',
    '',
    `Gerado em ${new Date().toISOString()}`,
    `Previews analisados: ${previews.length}`,
    '',
    '---',
    '',
    finalText.trim(),
    ''
  ].join('\n')

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const reportPath = path.join(runtime.paths.reportsDir, `deep-dive-${timestamp}.md`)
  await writeUtf8(reportPath, reportContent)

  const draftLeads = await createDraftLeadsFromTopLines(finalResult.topLines, runtime.paths.leadsDir, {
    createLead: async (input) =>
      createLeadFile(
        {
          slug: input.slug,
          title: input.title,
          description: input.description,
          status: 'draft',
          language: responseLanguage
        },
        { paths: runtime.paths }
      )
  })

  const relReport = toRelative(runtime.paths.projectRoot, reportPath)
  const now = new Date().toISOString()
  const sessionId = createDeepDiveSessionId()
  await createSession(
    runtime.paths,
    {
    stage: 'awaiting_plan_decision',
    reportPath: relReport,
    suggestedLeads: draftLeads,
    createdAt: now,
    updatedAt: now
    },
    sessionId
  )

  for (const lead of draftLeads) {
    if (lead.createdInLastRun) {
      feedback.leadSuggestion?.({
        leadId: lead.slug,
        slug: lead.slug,
        title: lead.title,
        description: lead.description,
        status: 'draft'
      })
    }
  }

  const suggestions = draftLeads.map((item, index) => `${index + 1}. ${item.title} (${item.slug})`)
  const skipped = draftLeads.filter((item) => !item.createdInLastRun).length
  feedback.summary('Deep-dive pronto', [
    'Analise concluida e contexto interno atualizado para os proximos turnos.',
    `Session ID: ${sessionId}`,
    `Leads sugeridos (${draftLeads.length}):`,
    ...suggestions,
    skipped > 0
      ? `Observacao: ${skipped} sugestao(oes) ja existia(m) e foi(foram) reaproveitada(s).`
      : 'Nenhuma duplicata detectada nesta rodada.',
    'Proximo passo: responda em linguagem natural com "plano de todos", "so o primeiro", ou "descarta e refaz".',
    'No CLI: pnpm reverso deep-dive-next --text "<sua resposta>".'
  ])

  if (ownsFeedback) {
    await feedback.flush()
  }
}

function createDeepDiveSessionId(): string {
  const time = Date.now().toString(36)
  const entropy = randomBytes(3).toString('hex')
  return `dd-${time}-${entropy}`
}

interface LeadSeed {
  title: string
  description: string
  slug: string
}

interface ExistingLeadSignature {
  slug: string
  normalizedTitle: string
  normalizedDescription: string
}

interface DuplicateMatch {
  slug: string
  reason: 'exact_match' | 'semantic_similarity'
}

const TITLE_SIMILARITY_THRESHOLD = 0.84
const COMPOSITE_SIMILARITY_THRESHOLD = 0.85

export async function createDraftLeadsFromTopLines(
  topLines: DigComparisonResult['topLines'],
  leadsDir: string,
  deps: {
    createLead: (input: LeadSeed) => Promise<{ leadPath: string }>
  }
): Promise<SuggestedLeadState[]> {
  const existing = await readExistingLeadSignatures(leadsDir)
  const created: SuggestedLeadState[] = []

  for (const line of topLines.slice().sort((a, b) => a.rank - b.rank)) {
    const title = line.title.trim()
    const description = line.description.trim()
    const slug = slugFromLeadTitle(title)
    if (!title || !description || !slug) continue

    const normalizedTitle = normalizeForComparison(title)
    const normalizedDescription = normalizeForComparison(description)
    const duplicate = findDuplicateLead({
      slug,
      normalizedTitle,
      normalizedDescription,
      existing
    })
    if (duplicate) {
      created.push({
        slug: duplicate.slug,
        title,
        description,
        status: 'draft',
        createdInLastRun: false,
        duplicateReason: duplicate.reason
      })
      if (created.length >= 3) break
      continue
    }

    await deps.createLead({ title, description, slug })
    existing.push({
      slug,
      normalizedTitle,
      normalizedDescription
    })
    created.push({
      slug,
      title,
      description,
      status: 'draft',
      createdInLastRun: true
    })
    if (created.length >= 3) break
  }

  return created
}

function findDuplicateLead(input: {
  slug: string
  normalizedTitle: string
  normalizedDescription: string
  existing: ExistingLeadSignature[]
}): DuplicateMatch | undefined {
  const exact = input.existing.find(
    (item) =>
      item.slug === input.slug ||
      item.normalizedTitle === input.normalizedTitle ||
      item.normalizedDescription === input.normalizedDescription
  )
  if (exact) {
    return {
      slug: exact.slug,
      reason: 'exact_match'
    }
  }

  let best: { slug: string; score: number } | undefined
  for (const item of input.existing) {
    const titleLevenshtein = similarityScore(input.normalizedTitle, item.normalizedTitle)
    const titleTokenJaccard = jaccardSimilarity(input.normalizedTitle, item.normalizedTitle)
    const titleScore = Math.max(titleLevenshtein, titleTokenJaccard)
    const descriptionScore =
      input.normalizedDescription && item.normalizedDescription
        ? similarityScore(input.normalizedDescription, item.normalizedDescription)
        : 0
    const compositeScore = titleScore * 0.8 + descriptionScore * 0.2
    const isDuplicate =
      titleScore >= TITLE_SIMILARITY_THRESHOLD || compositeScore >= COMPOSITE_SIMILARITY_THRESHOLD
    if (!isDuplicate) continue
    if (!best || compositeScore > best.score) {
      best = {
        slug: item.slug,
        score: compositeScore
      }
    }
  }
  if (!best) return undefined
  return {
    slug: best.slug,
    reason: 'semantic_similarity'
  }
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean))
  const setB = new Set(b.split(' ').filter(Boolean))
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const token of setA) {
    if (setB.has(token)) intersection += 1
  }
  const union = setA.size + setB.size - intersection
  if (union <= 0) return 0
  return intersection / union
}

async function readExistingLeadSignatures(leadsDir: string): Promise<ExistingLeadSignature[]> {
  let entries: Dirent[]
  try {
    entries = await readdir(leadsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const signatures: ExistingLeadSignature[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const leadPath = path.join(leadsDir, entry.name)
    try {
      const raw = await readFile(leadPath, 'utf8')
      const title =
        raw.match(/^title:\s+"?(.+?)"?$/m)?.[1]?.trim() ??
        raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
        entry.name.replace(/^lead-/, '').replace(/\.md$/, '')
      const description =
        raw.match(/^# (?:Context|Contexto)\n([\s\S]*?)(?=\n## )/m)?.[1]?.trim() ?? ''
      signatures.push({
        slug: entry.name.replace(/^lead-/, '').replace(/\.md$/, ''),
        normalizedTitle: normalizeForComparison(title),
        normalizedDescription: normalizeForComparison(description)
      })
    } catch {
      continue
    }
  }
  return signatures
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

export function slugFromLeadTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function renderDigMarkdownReport(input: {
  accumulatedConclusions: DigIncrementalConclusion
  suggestedLines: DigLinesResult
  finalResult: DigComparisonResult
}): string {
  const topLines = input.finalResult.topLines
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map(
      (line) =>
        `${line.rank}. **${line.title}** — ${line.description}\n   - Diferencial: ${line.differentiation}`
    )
  const linesPool = input.suggestedLines.lines
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((line) => `${line.rank}. **${line.title}** — ${line.rationale}`)
  return [
    '## Conclusao incremental',
    input.accumulatedConclusions.summary,
    '',
    '## Key findings',
    ...input.accumulatedConclusions.keyFindings.map((item) => `- ${item}`),
    '',
    '## Hypotheses',
    ...input.accumulatedConclusions.hypotheses.map((item) => `- ${item}`),
    '',
    '## Gaps',
    ...input.accumulatedConclusions.gaps.map((item) => `- ${item}`),
    '',
    '## Suggested lines pool',
    ...linesPool,
    '',
    '## Suggested lines (top 3)',
    ...topLines,
    '',
    '## Overlap notes',
    ...input.finalResult.overlapNotes.map((item) => `- ${item}`),
    '',
    '## Recommendation',
    input.finalResult.recommendation
  ].join('\n')
}

async function requestStrictDigPayload<T>(input: {
  client: OpenRouterClient
  model: string
  systemPrompt: string
  userPrompt: string
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
  contractName: 'dig.incremental' | 'dig.lines' | 'dig.comparison'
  hardRules: string[]
  validator: (value: unknown) => { ok: true; value: T } | { ok: false; errors: Array<{ path: string; message: string }> }
}): Promise<T> {
  let raw = await input.client.chatText({
    model: input.model,
    system: input.systemPrompt,
    user: input.userPrompt,
    temperature: 0.2
  })

  const validateRaw = (): { ok: true; value: T } | { ok: false; error: string } => {
    const parsed = parseStrictJson(raw)
    if (!parsed.ok) return { ok: false, error: formatContractErrors(parsed.errors) }
    const contract = input.validator(parsed.value)
    if (!contract.ok) return { ok: false, error: formatContractErrors(contract.errors) }
    return { ok: true, value: contract.value }
  }

  let attempt = validateRaw()
  if (attempt.ok) return attempt.value

  if (!input.selfRepairEnabled || input.selfRepairMaxRounds <= 0) {
    throw new Error(`[${input.contractName}] invalid JSON payload: ${attempt.error}`)
  }

  for (let round = 1; round <= input.selfRepairMaxRounds; round += 1) {
    input.feedback.systemWarn(`[${input.contractName}] invalid payload; self-repair round ${round}...`)
    raw = await input.client.chatText({
      model: input.model,
      system: buildCritiqueRepairSystemPrompt(),
      user: buildCritiqueRepairUserPrompt({
        contractName: input.contractName,
        hardRules: input.hardRules,
        inputJson: raw
      }),
      temperature: 0.05
    })
    attempt = validateRaw()
    if (attempt.ok) return attempt.value
  }

  throw new Error(`[${input.contractName}] invalid payload after self-repair: ${attempt.error}`)
}
