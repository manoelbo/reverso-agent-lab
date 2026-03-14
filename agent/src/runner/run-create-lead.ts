import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { resolveRuntimeConfig } from '../config/env.js'
import {
  ensureDir,
  listPreviewCandidates,
  readSourceCheckpoint,
  slugify
} from '../core/fs-io.js'
import { toRelative } from '../core/paths.js'
import { createLeadFile } from '../tools/investigative/create-lead-file.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'
import { OpenRouterClient } from '../llm/openrouter-client.js'
import { stripCodeFence } from '../core/markdown.js'
import {
  buildCreateLeadSystemPrompt,
  buildCreateLeadUserPrompt,
  type CreateLeadIAResponse
} from '../prompts/create-lead.js'
import { getToolManifestForPrompt } from '../prompts/tool-manifest.js'
import type { InquiryPlan } from '../core/contracts.js'
import {
  buildResponseLanguageInstruction,
  resolveResponseLanguageForPrompt,
  type LanguageCode
} from '../core/language.js'
import {
  formatContractErrors,
  parseStrictJson,
  validateCreateLeadPayload
} from '../core/json-contract.js'
import {
  buildCritiqueRepairSystemPrompt,
  buildCritiqueRepairUserPrompt
} from '../prompts/critique-repair.js'

export interface RunCreateLeadOptions {
  idea?: string
  model?: string
  responseLanguage?: string
  enablePev?: boolean
  selfRepairEnabled?: boolean
  selfRepairMaxRounds?: number
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
  waitForApproval?: (requestId: string) => Promise<boolean>
}

interface ParsedCreateLead {
  codename: string
  title: string
  description: string
  inquiryPlan: InquiryPlan
}

export interface CreateInquiryPlanOnlyInput {
  idea: string
  sourceSummary?: string
  model: string
  responseLanguage: LanguageCode
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
  client: OpenRouterClient
}

export function normalizeLeadSlug(codename: string): string {
  const slug = slugify(codename).replace(/^-+|-+$/g, '')
  if (!slug) return 'investigation'
  return slug.startsWith('lead-') ? slug.slice('lead-'.length) : slug
}

/** Exportado para testes. */
export function parseCreateLeadResponse(raw: string): ParsedCreateLead {
  const parsedJson = parseStrictJson(raw)
  if (!parsedJson.ok) {
    throw new Error(`Invalid create-lead JSON: ${formatContractErrors(parsedJson.errors)}`)
  }
  const contract = validateCreateLeadPayload(parsedJson.value)
  if (!contract.ok) {
    throw new Error(`Invalid create-lead contract: ${formatContractErrors(contract.errors)}`)
  }
  const parsed = contract.value
  return {
    codename: parsed.codename ?? 'investigation',
    title: parsed.title ?? 'Investigation lead',
    description: parsed.description ?? '',
    inquiryPlan: normalizeInquiryPlan(parsed.inquiryPlan)
  }
}

export async function runCreateLead(options: RunCreateLeadOptions = {}): Promise<void> {
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
  await ensureDir(runtime.paths.investigationDir)
  await ensureDir(runtime.paths.leadsDir)
  await ensureDir(runtime.paths.allegationsDir)
  await ensureDir(runtime.paths.findingsDir)

  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'create-lead',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))

  const idea = options.idea?.trim()
  const responseLanguage = resolveResponseLanguageForPrompt(
    idea
      ? {
          mode: runtime.responseLanguage,
          fallback: runtime.defaultResponseLanguage,
          userText: idea
        }
      : {
          mode: runtime.responseLanguage,
          fallback: runtime.defaultResponseLanguage
        }
  )

  feedback.stepStart('create-lead', idea ? `Criando lead a partir da ideia: "${idea}"` : 'Gerando lead (ideia livre)...')

  const client = new OpenRouterClient(runtime.apiKey)
  const sourceSummary = await buildSourceSummary(runtime.paths.sourceArtifactsDir, runtime.paths.sourceDir)
  if (sourceSummary) {
    feedback.systemInfo('Contexto de source carregado para planejar o lead')
  } else {
    feedback.systemWarn(
      'Nenhum preview encontrado em filesystem/source/.artifacts (ou fallback legado); lead sera gerado sem contexto de source.'
    )
  }

  const parsed = await createLeadPayloadFromIdea({
    model: runtime.model,
    responseLanguage,
    selfRepairEnabled: runtime.selfRepairEnabled,
    selfRepairMaxRounds: runtime.selfRepairMaxRounds,
    feedback,
    client,
    ...(idea ? { idea } : {}),
    ...(sourceSummary ? { sourceSummary } : {})
  })
  const slug = normalizeLeadSlug(parsed.codename)
  const title = parsed.title
  const description = parsed.description

  const leadFilePath = path.join(runtime.paths.leadsDir, `lead-${slug}.md`)
  const leadAlreadyExists = await fileExists(leadFilePath)
  if (leadAlreadyExists) {
    const dupRequestId = randomUUID()
    feedback.requestApproval(
      dupRequestId,
      'Lead similar já existe',
      `O lead "${title}" (${slug}) já existe em investigation/leads. Deseja criar mesmo assim?`
    )
    if (options.waitForApproval) {
      const approved = await options.waitForApproval(dupRequestId)
      if (!approved) {
        feedback.summary('Lead não criado', [
          `Lead "${title}" não foi criado — já existe um lead similar (${slug}).`,
          'Dica: investigue o lead existente ou refine a ideia antes de criar um novo.'
        ])
        if (ownsFeedback) {
          await feedback.flush()
        }
        return
      }
    }
  }

  feedback.stepStart('save-lead', 'Salvando lead e planejamento de inquiry em filesystem/investigation/leads...')

  const output = await createLeadFile(
    {
      title,
      description,
      slug,
      language: responseLanguage,
      status: 'planned',
      inquiryPlan: parsed.inquiryPlan
    },
    { paths: runtime.paths }
  )

  const relPath = toRelative(runtime.paths.projectRoot, output.leadPath)
  feedback.fileCreated(relPath, 0, `Lead "${title}" criado com Inquiry Plan.`)
  feedback.stepComplete('save-lead', relPath)
  feedback.stepComplete('create-lead')

  const inquiryPlanText = formatInquiryPlanAsText(parsed.inquiryPlan)
  feedback.leadSuggestion?.({
    leadId: slug,
    slug,
    title,
    description,
    inquiryPlan: inquiryPlanText,
    status: 'planned'
  })

  feedback.summary('Lead criado', [
    `Lead: ${relPath}`,
    'Proximo passo: execute /inquiry para gerar allegations e findings conectados ao lead.'
  ])

  if (ownsFeedback) {
    await feedback.flush()
  }
}

export async function createInquiryPlanOnly(
  input: CreateInquiryPlanOnlyInput
): Promise<{ inquiryPlan: InquiryPlan; title: string; description: string; codename: string }> {
  const parsed = await createLeadPayloadFromIdea({
    idea: input.idea,
    model: input.model,
    responseLanguage: input.responseLanguage,
    selfRepairEnabled: input.selfRepairEnabled,
    selfRepairMaxRounds: input.selfRepairMaxRounds,
    feedback: input.feedback,
    client: input.client,
    ...(input.sourceSummary ? { sourceSummary: input.sourceSummary } : {})
  })
  return {
    inquiryPlan: parsed.inquiryPlan,
    title: parsed.title,
    description: parsed.description,
    codename: parsed.codename
  }
}

async function createLeadPayloadFromIdea(input: {
  idea?: string
  sourceSummary?: string
  model: string
  responseLanguage: LanguageCode
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
  client: OpenRouterClient
}): Promise<ParsedCreateLead> {
  const userPrompt = buildCreateLeadUserPrompt(input.idea, input.sourceSummary)
  const systemPrompt = buildCreateLeadSystemPrompt(
    getToolManifestForPrompt(),
    buildResponseLanguageInstruction(input.responseLanguage)
  )
  return requestCreateLeadPayload({
    client: input.client,
    model: input.model,
    systemPrompt,
    userPrompt,
    selfRepairEnabled: input.selfRepairEnabled,
    selfRepairMaxRounds: input.selfRepairMaxRounds,
    feedback: input.feedback
  })
}

async function requestCreateLeadPayload(input: {
  client: OpenRouterClient
  model: string
  systemPrompt: string
  userPrompt: string
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
}): Promise<ParsedCreateLead> {
  let raw = await input.client.chatText({
    model: input.model,
    system: input.systemPrompt,
    user: input.userPrompt,
    temperature: 0.3
  })
  const parseAttempt = (): { ok: true; value: ParsedCreateLead } | { ok: false; error: string } => {
    try {
      return { ok: true, value: parseCreateLeadResponse(raw) }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown create-lead parse error.'
      }
    }
  }

  let attempt = parseAttempt()
  if (attempt.ok) return attempt.value

  if (!input.selfRepairEnabled || input.selfRepairMaxRounds <= 0) {
    throw new Error(`Create-lead contract validation failed: ${attempt.error}`)
  }

  for (let round = 1; round <= input.selfRepairMaxRounds; round += 1) {
    input.feedback.systemWarn(`Create-lead JSON invalid. Running self-repair round ${round}...`)
    raw = await input.client.chatText({
      model: input.model,
      system: buildCritiqueRepairSystemPrompt(),
      user: buildCritiqueRepairUserPrompt({
        contractName: 'create-lead',
        hardRules: [
          'Return a single JSON object only.',
          'Required keys: codename, title, description, inquiryPlan.',
          'inquiryPlan must contain 4 arrays: formulateAllegations, defineSearchStrategy, gatherFindings, mapToAllegations.',
          'All checklist items must be non-empty strings.'
        ],
        inputJson: stripCodeFence(raw)
      }),
      temperature: 0.05
    })
    attempt = parseAttempt()
    if (attempt.ok) return attempt.value
  }

  throw new Error(`Create-lead contract validation failed after self-repair: ${attempt.error}`)
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeInquiryPlan(input: CreateLeadIAResponse['inquiryPlan']): InquiryPlan {
  const fallback = ['No detail provided by the model']
  return {
    formulateAllegations: asStringList(input?.formulateAllegations).slice(0, 8).length
      ? asStringList(input?.formulateAllegations).slice(0, 8)
      : fallback,
    defineSearchStrategy: asStringList(input?.defineSearchStrategy).slice(0, 8).length
      ? asStringList(input?.defineSearchStrategy).slice(0, 8)
      : fallback,
    gatherFindings: asStringList(input?.gatherFindings).slice(0, 8).length
      ? asStringList(input?.gatherFindings).slice(0, 8)
      : fallback,
    mapToAllegations: asStringList(input?.mapToAllegations).slice(0, 8).length
      ? asStringList(input?.mapToAllegations).slice(0, 8)
      : fallback
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function formatInquiryPlanAsText(inquiryPlan: InquiryPlan): string {
  const sections: string[] = []
  if (inquiryPlan.formulateAllegations.length > 0) {
    sections.push(
      'Formular alegações:\n' + inquiryPlan.formulateAllegations.map((s) => `- ${s}`).join('\n')
    )
  }
  if (inquiryPlan.defineSearchStrategy.length > 0) {
    sections.push(
      'Estratégia de busca:\n' + inquiryPlan.defineSearchStrategy.map((s) => `- ${s}`).join('\n')
    )
  }
  if (inquiryPlan.gatherFindings.length > 0) {
    sections.push(
      'Coletar findings:\n' + inquiryPlan.gatherFindings.map((s) => `- ${s}`).join('\n')
    )
  }
  if (inquiryPlan.mapToAllegations.length > 0) {
    sections.push(
      'Mapear para alegações:\n' + inquiryPlan.mapToAllegations.map((s) => `- ${s}`).join('\n')
    )
  }
  return sections.join('\n\n')
}

async function buildSourceSummary(
  sourceArtifactsDir: string,
  sourceDir: string
): Promise<string | undefined> {
  const docIdToName = await readSourceCheckpoint(sourceDir)
  const candidates = await listPreviewCandidates(sourceArtifactsDir, docIdToName)
  if (candidates.length === 0) return undefined

  const lines = candidates
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.documentName} (docId: ${item.docId})`)

  const suffix =
    candidates.length > 12
      ? `\n... and ${candidates.length - 12} more document(s) with preview.`
      : ''

  return `Total documents with preview: ${candidates.length}\n${lines.join('\n')}${suffix}`
}
