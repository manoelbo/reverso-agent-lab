import path from 'node:path'
import { unlink } from 'node:fs/promises'
import { resolveRuntimeConfig } from '../config/env.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'
import {
  type DeepDiveSessionState,
  type SuggestedLeadState
} from '../core/deep-dive-session.js'
import {
  loadActiveSession,
  saveSession,
  setActiveSession,
  type DeepDiveSessionRecord
} from '../core/deep-dive-session-store.js'
import {
  buildDeepDiveFollowupSystemPrompt,
  buildDeepDiveFollowupUserPrompt,
  type DeepDiveFollowupIntent
} from '../prompts/deep-dive-followup.js'
import { OpenRouterClient } from '../llm/openrouter-client.js'
import { parseStrictJson } from '../core/json-contract.js'
import { createInquiryPlanOnly } from './run-create-lead.js'
import { updateLeadPlanAndStatus } from '../tools/investigative/create-lead-file.js'
import { runDig } from './run-dig.js'
import { runInquiry } from './run-inquiry.js'
import { similarityScore } from '../tools/document-processing/standard/dedup/fuzzy-match.js'

export interface RunDeepDiveNextOptions {
  text: string
  model?: string
  responseLanguage?: string
  enablePev?: boolean
  selfRepairEnabled?: boolean
  selfRepairMaxRounds?: number
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
}

interface FollowupIntentResult {
  intent: DeepDiveFollowupIntent
  targetIndex?: number
  targetSlug?: string
  targetTitle?: string
  confidence: number
}

export interface LeadTargetResolution {
  kind: 'slug_exact' | 'title_exact' | 'title_fuzzy' | 'index' | 'ambiguous' | 'none'
  lead?: SuggestedLeadState
  candidates?: SuggestedLeadState[]
  targetIndex?: number
}

const TARGET_TITLE_FUZZY_THRESHOLD = 0.86

export async function runDeepDiveNext(options: RunDeepDiveNextOptions): Promise<void> {
  const text = options.text.trim()
  if (!text) {
    throw new Error('Forneca a resposta do usuario com --text "<mensagem>"')
  }

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
  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'deep-dive-next',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))

  const session = await loadActiveSession(runtime.paths)
  if (!session) {
    throw new Error('Nenhuma sessao deep-dive ativa. Execute primeiro: pnpm reverso deep-dive')
  }

  const intent = await classifyFollowupIntent({
    text,
    stage: session.stage,
    model: runtime.model,
    client: new OpenRouterClient(runtime.apiKey),
    suggestedLeads: session.suggestedLeads
  })

  if (session.stage === 'awaiting_plan_decision') {
    await handlePlanDecision({
      session,
      intent,
      runtime,
      feedback,
      text
    })
  } else if (session.stage === 'awaiting_inquiry_execution') {
    await handleInquiryExecutionDecision({
      session,
      intent,
      runtime,
      feedback,
      text
    })
  } else {
    feedback.summary('Sessao encerrada', [
      'Nao ha pendencias nesta sessao.',
      'Se quiser nova rodada, execute: pnpm reverso deep-dive'
    ])
  }

  if (ownsFeedback) {
    await feedback.flush()
  }
}

async function handlePlanDecision(input: {
  session: DeepDiveSessionRecord
  intent: FollowupIntentResult
  runtime: Awaited<ReturnType<typeof resolveRuntimeConfig>>
  feedback: UiFeedbackController
  text: string
}): Promise<void> {
  const { session, intent, runtime, feedback } = input
  if (intent.intent === 'redo') {
    for (const lead of session.suggestedLeads) {
      if (!lead.createdInLastRun) continue
      const leadPath = path.join(runtime.paths.leadsDir, `lead-${lead.slug}.md`)
      await unlink(leadPath).catch(() => undefined)
    }
    feedback.stepStart('redo', 'Descartando drafts e executando novo deep-dive...')
    await runDig({
      model: runtime.model,
      responseLanguage: runtime.responseLanguage,
      enablePev: runtime.enablePev,
      selfRepairEnabled: runtime.selfRepairEnabled,
      selfRepairMaxRounds: runtime.selfRepairMaxRounds,
      feedback
    })
    return
  }

  if (intent.intent !== 'plan_all' && intent.intent !== 'plan_one') {
    feedback.summary('Resposta ambigua', [
      `Nao consegui interpretar com confianca suficiente: "${input.text}"`,
      'Responda com: "plano de todos", "so o primeiro", ou "descarta e refaz".'
    ])
    return
  }

  const selected = pickLeadsForIntent(session, intent, input.text)
  if (selected.length === 0) {
    const resolution = resolveLeadTargetFromText(input.text, session.suggestedLeads)
    if (resolution.kind === 'ambiguous' && resolution.candidates && resolution.candidates.length > 0) {
      feedback.summary('Selecao ambigua', [
        'Sua resposta pode apontar para mais de um lead. Escolha explicitamente um alvo:',
        ...resolution.candidates.map((lead, idx) => `${idx + 1}. ${lead.title} (${lead.slug})`),
        'Exemplos: "faz o plano do lead <slug>" ou "faz o plano do lead 2".'
      ])
    } else {
      feedback.summary('Sem leads selecionados', [
        'Nao foi possivel identificar lead alvo.',
        'Tente "so o primeiro", "plano de todos" ou "faz o plano do lead <slug>".'
      ])
    }
    return
  }
  if (intent.intent === 'plan_one') {
    const resolution = resolveLeadTargetFromText(input.text, session.suggestedLeads)
    if (resolution.lead) {
      feedback.systemInfo(`Lead resolvido por ${resolution.kind}: ${resolution.lead.title} (${resolution.lead.slug})`)
    }
  }

  const sourceSummary = `Latest report: ${session.reportPath}\nSuggested leads: ${session.suggestedLeads.length}`
  const client = new OpenRouterClient(runtime.apiKey)
  for (const lead of selected) {
    feedback.stepStart(`plan-${lead.slug}`, `Gerando Inquiry Plan para ${lead.slug}...`)
    const payload = await createInquiryPlanOnly({
      idea: `${lead.title}\n${lead.description}`,
      sourceSummary,
      model: runtime.model,
      responseLanguage: 'en',
      selfRepairEnabled: runtime.selfRepairEnabled,
      selfRepairMaxRounds: runtime.selfRepairMaxRounds,
      feedback,
      client
    })
    await updateLeadPlanAndStatus(
      {
        slug: lead.slug,
        inquiryPlan: payload.inquiryPlan,
        status: 'planned',
        language: runtime.responseLanguage === 'auto' ? 'en' : runtime.responseLanguage
      },
      { paths: runtime.paths }
    )
    feedback.stepComplete(`plan-${lead.slug}`)
    lead.status = 'planned'
  }

  session.stage = 'awaiting_inquiry_execution'
  session.updatedAt = new Date().toISOString()
  await saveSession(runtime.paths, session)
  await setActiveSession(runtime.paths, session.sessionId)

  const planned = selected.map((lead, idx) => `${idx + 1}. ${lead.title} (${lead.slug})`)
  feedback.summary('Inquiry plans prontos', [
    `Planos criados para ${selected.length} lead(s):`,
    ...planned,
    'Proximo passo: deseja executar inquiry para todos ou para um lead especifico?',
    'No CLI: pnpm reverso deep-dive-next --text "executa todos"'
  ])
}

async function handleInquiryExecutionDecision(input: {
  session: DeepDiveSessionRecord
  intent: FollowupIntentResult
  runtime: Awaited<ReturnType<typeof resolveRuntimeConfig>>
  feedback: UiFeedbackController
  text: string
}): Promise<void> {
  const { session, intent, runtime, feedback } = input
  const plannedLeads = session.suggestedLeads.filter((lead) => lead.status === 'planned')
  if (plannedLeads.length === 0) {
    feedback.summary('Sem leads planejados', [
      'Nao ha leads com Inquiry Plan nesta sessao.',
      'Responda para gerar plano antes de executar inquiry.'
    ])
    return
  }

  let selected = plannedLeads
  if (intent.intent === 'execute_one') {
    const resolution = resolveLeadTargetFromText(input.text, plannedLeads, {
      ...(intent.targetIndex ? { preferredIndex: intent.targetIndex } : {}),
      ...(intent.targetSlug ? { preferredSlug: intent.targetSlug } : {}),
      ...(intent.targetTitle ? { preferredTitle: intent.targetTitle } : {})
    })
    if (resolution.kind === 'ambiguous' && resolution.candidates && resolution.candidates.length > 0) {
      feedback.summary('Selecao ambigua para execucao', [
        'Mais de um lead corresponde ao pedido. Escolha explicitamente:',
        ...resolution.candidates.map((lead, idx) => `${idx + 1}. ${lead.title} (${lead.slug})`),
        'Exemplos: "executa o lead <slug>" ou "executa o lead 1".'
      ])
      return
    }
    if (resolution.lead) {
      feedback.systemInfo(
        `Lead de execucao resolvido por ${resolution.kind}: ${resolution.lead.title} (${resolution.lead.slug})`
      )
    }
    const picked = resolution.lead
    selected = picked ? [picked] : []
  } else if (intent.intent !== 'execute_all') {
    feedback.summary('Aguardando confirmacao de execucao', [
      'Responda com "executa todos" ou "executa o primeiro".'
    ])
    return
  }

  for (const lead of selected) {
    await runInquiry({
      lead: lead.slug,
      model: runtime.model,
      responseLanguage: runtime.responseLanguage,
      enablePev: runtime.enablePev,
      selfRepairEnabled: runtime.selfRepairEnabled,
      selfRepairMaxRounds: runtime.selfRepairMaxRounds,
      evidenceGateEnabled: runtime.evidenceGateEnabled,
      evidenceMinConfidence: runtime.evidenceMinConfidence,
      enrichedToolManifestEnabled: runtime.enrichedToolManifestEnabled,
      strictPlanningValidation: runtime.strictPlanningValidation,
      preWriteValidationEnabled: runtime.preWriteValidationEnabled,
      preWriteValidationStrict: runtime.preWriteValidationStrict,
      criticalWriteGateEnabled: runtime.criticalWriteGateEnabled,
      requireExplicitWriteApproval: runtime.requireExplicitWriteApproval,
      feedback
    })
  }

  session.stage = 'completed'
  session.updatedAt = new Date().toISOString()
  await saveSession(runtime.paths, session)
  await setActiveSession(runtime.paths, session.sessionId)
  feedback.summary('Fluxo concluido', [
    `Inquiry executada para ${selected.length} lead(s).`,
    'Sessao marcada como concluida.'
  ])
}

function pickLeadsForIntent(
  session: DeepDiveSessionState,
  intent: FollowupIntentResult,
  userText: string
) {
  if (intent.intent === 'plan_all') return session.suggestedLeads
  if (intent.intent === 'plan_one') {
    const resolution = resolveLeadTargetFromText(userText, session.suggestedLeads, {
      ...(intent.targetIndex ? { preferredIndex: intent.targetIndex } : {}),
      ...(intent.targetSlug ? { preferredSlug: intent.targetSlug } : {}),
      ...(intent.targetTitle ? { preferredTitle: intent.targetTitle } : {})
    })
    return resolution.lead ? [resolution.lead] : []
  }
  return []
}

async function classifyFollowupIntent(input: {
  text: string
  stage: DeepDiveSessionState['stage']
  model: string
  client: OpenRouterClient
  suggestedLeads: DeepDiveSessionState['suggestedLeads']
}): Promise<FollowupIntentResult> {
  const heuristic = heuristicIntent(input.text, input.stage)
  if (heuristic.intent !== 'unknown') {
    return heuristic
  }
  const userPrompt = buildDeepDiveFollowupUserPrompt({
    stage:
      input.stage === 'awaiting_plan_decision'
        ? 'awaiting_plan_decision'
        : 'awaiting_inquiry_execution',
    userText: input.text,
    availableLeads: input.suggestedLeads.map((lead, index) => ({
      index: index + 1,
      slug: lead.slug,
      title: lead.title
    }))
  })
  const raw = await input.client.chatText({
    model: input.model,
    system: buildDeepDiveFollowupSystemPrompt(),
    user: userPrompt,
    temperature: 0
  })
  const parsed = parseStrictJson(raw)
  if (!parsed.ok || typeof parsed.value !== 'object' || parsed.value === null) {
    return heuristic
  }
  const value = parsed.value as {
    intent?: unknown
    targetIndex?: unknown
    targetSlug?: unknown
    targetTitle?: unknown
    confidence?: unknown
  }
  const intent =
    typeof value.intent === 'string'
      ? (value.intent as DeepDiveFollowupIntent)
      : ('unknown' as DeepDiveFollowupIntent)
  const targetIndex =
    typeof value.targetIndex === 'number' && Number.isFinite(value.targetIndex)
      ? Math.max(1, Math.floor(value.targetIndex))
      : undefined
  const confidence =
    typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : 0.5
  const targetSlug =
    typeof value.targetSlug === 'string' && value.targetSlug.trim().length > 0
      ? value.targetSlug.trim().toLowerCase().replace(/^lead-/, '')
      : undefined
  const targetTitle =
    typeof value.targetTitle === 'string' && value.targetTitle.trim().length > 0
      ? value.targetTitle.trim()
      : undefined
  return {
    intent,
    ...(targetIndex ? { targetIndex } : {}),
    ...(targetSlug ? { targetSlug } : {}),
    ...(targetTitle ? { targetTitle } : {}),
    confidence
  }
}

export function heuristicIntent(
  text: string,
  stage: DeepDiveSessionState['stage']
): FollowupIntentResult {
  const normalized = text.toLowerCase()
  const extractFirstMentionedIndex = (): number | undefined => {
    if (normalized.includes('primeiro') || normalized.includes('first')) return 1
    if (normalized.includes('segundo') || normalized.includes('second')) return 2
    if (normalized.includes('terceiro') || normalized.includes('third')) return 3
    const match = normalized.match(/\b([1-3])\b/)
    if (!match) return undefined
    return Number.parseInt(match[1] ?? '1', 10)
  }
  const isRedo =
    normalized.includes('refaz') ||
    normalized.includes('refazer') ||
    normalized.includes('redo') ||
    normalized.includes('de novo') ||
    normalized.includes('descarta')
  if (isRedo && stage === 'awaiting_plan_decision') return { intent: 'redo', confidence: 0.95 }

  const asksAll =
    normalized.includes('todos') ||
    normalized.includes('todas') ||
    normalized.includes('all')
  const asksPlan =
    normalized.includes('plano') ||
    normalized.includes('plan') ||
    normalized.includes('planejar')
  const asksExecute =
    normalized.includes('executa') ||
    normalized.includes('execute') ||
    normalized.includes('rodar inquiry') ||
    normalized.includes('run inquiry')

  if (stage === 'awaiting_plan_decision') {
    if (asksAll && asksPlan) return { intent: 'plan_all', confidence: 0.92 }
    if (asksPlan) {
      const targetIndex = extractFirstMentionedIndex() ?? 1
      return { intent: 'plan_one', targetIndex, confidence: 0.9 }
    }
  }

  if (stage === 'awaiting_inquiry_execution') {
    if (asksAll && asksExecute) return { intent: 'execute_all', confidence: 0.92 }
    if (asksExecute) {
      const targetIndex = extractFirstMentionedIndex() ?? 1
      return { intent: 'execute_one', targetIndex, confidence: 0.9 }
    }
  }

  if (normalized.includes('espera') || normalized.includes('wait') || normalized.includes('depois')) {
    return { intent: 'hold', confidence: 0.8 }
  }

  return { intent: 'unknown', confidence: 0.4 }
}

export function resolveLeadTargetFromText(
  userText: string,
  leads: SuggestedLeadState[],
  preferred?: {
    preferredIndex?: number
    preferredSlug?: string
    preferredTitle?: string
  }
): LeadTargetResolution {
  if (leads.length === 0) return { kind: 'none' }
  const normalizedText = normalizeForComparison(userText)
  const preferredSlug = preferred?.preferredSlug?.trim().toLowerCase().replace(/^lead-/, '')
  if (preferredSlug) {
    const matched = leads.find((lead) => lead.slug === preferredSlug)
    if (matched) return { kind: 'slug_exact', lead: matched }
  }
  const explicitSlug = extractSlugCandidate(userText)
  if (explicitSlug) {
    const matched = leads.find((lead) => lead.slug === explicitSlug)
    if (matched) return { kind: 'slug_exact', lead: matched }
  }

  const preferredTitle = preferred?.preferredTitle ? normalizeForComparison(preferred.preferredTitle) : ''
  if (preferredTitle) {
    const matches = leads.filter((lead) => normalizeForComparison(lead.title) === preferredTitle)
    if (matches.length === 1 && matches[0]) return { kind: 'title_exact', lead: matches[0] }
    if (matches.length > 1) return { kind: 'ambiguous', candidates: matches }
  }

  const exactTitleMatches = leads.filter((lead) => {
    const titleNorm = normalizeForComparison(lead.title)
    return normalizedText.includes(titleNorm)
  })
  if (exactTitleMatches.length === 1 && exactTitleMatches[0]) {
    return { kind: 'title_exact', lead: exactTitleMatches[0] }
  }
  if (exactTitleMatches.length > 1) return { kind: 'ambiguous', candidates: exactTitleMatches }

  const fuzzyCandidates = leads
    .map((lead) => {
      const titleNorm = normalizeForComparison(lead.title)
      const score = Math.max(
        similarityScore(normalizedText, titleNorm),
        similarityScore(extractLikelyTargetPhrase(normalizedText), titleNorm)
      )
      return {
        lead,
        score
      }
    })
    .filter((entry) => entry.score >= TARGET_TITLE_FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  if (fuzzyCandidates.length > 1) {
    const first = fuzzyCandidates[0]
    const second = fuzzyCandidates[1]
    if (first && second && first.score - second.score < 0.03) {
      return {
        kind: 'ambiguous',
        candidates: fuzzyCandidates.slice(0, 3).map((entry) => entry.lead)
      }
    }
  }
  if (fuzzyCandidates.length === 1) {
    const only = fuzzyCandidates[0]
    if (!only) return { kind: 'none' }
    return {
      kind: 'title_fuzzy',
      lead: only.lead
    }
  }

  const overlapCandidates = findOverlapCandidates(normalizedText, leads)
  if (overlapCandidates.length > 1) {
    return {
      kind: 'ambiguous',
      candidates: overlapCandidates
    }
  }

  const index = Math.max(1, preferred?.preferredIndex ?? extractMentionedIndex(normalizedText) ?? 1)
  const indexed = leads[index - 1]
  if (indexed) return { kind: 'index', lead: indexed, targetIndex: index }
  return { kind: 'none' }
}

function extractSlugCandidate(text: string): string | undefined {
  const lowered = text.toLowerCase()
  const leadPrefixed = lowered.match(/lead-([a-z0-9-]+)/)
  if (leadPrefixed?.[1]) return leadPrefixed[1]
  const direct = lowered.match(/\b([a-z0-9]+(?:-[a-z0-9]+)+)\b/)
  if (!direct?.[1]) return undefined
  return direct[1]
}

function extractLikelyTargetPhrase(normalizedText: string): string {
  const markers = ['lead', 'plano', 'plan', 'executa', 'execute', 'do', 'of']
  const tokens = normalizedText.split(' ').filter(Boolean)
  const idx = tokens.findIndex((token) => markers.includes(token))
  if (idx === -1) return normalizedText
  const phrase = tokens.slice(idx + 1).join(' ').trim()
  return phrase || normalizedText
}

function extractMentionedIndex(normalizedText: string): number | undefined {
  if (normalizedText.includes('primeiro') || normalizedText.includes('first')) return 1
  if (normalizedText.includes('segundo') || normalizedText.includes('second')) return 2
  if (normalizedText.includes('terceiro') || normalizedText.includes('third')) return 3
  const match = normalizedText.match(/\b([1-9])\b/)
  if (!match?.[1]) return undefined
  return Number.parseInt(match[1], 10)
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function findOverlapCandidates(text: string, leads: SuggestedLeadState[]): SuggestedLeadState[] {
  const phrase = extractLikelyTargetPhrase(text)
  const queryTokens = phrase.split(' ').filter((token) => token.length >= 4)
  if (queryTokens.length < 2) return []
  return leads.filter((lead) => {
    const titleTokens = new Set(normalizeForComparison(lead.title).split(' ').filter(Boolean))
    let overlap = 0
    for (const token of queryTokens) {
      if (titleTokens.has(token)) overlap += 1
    }
    return overlap >= 2
  })
}

