import { stripCodeFence } from './markdown.js'
import type {
  EvidenceLocation,
  EvidenceVerificationStatus,
  InquiryPlan
} from './contracts.js'
import type {
  DigComparisonResult,
  DigIncrementalConclusion,
  DigLinesResult
} from '../prompts/dig.js'

export interface ValidatedCreateLeadPayload {
  codename: string
  title: string
  description: string
  inquiryPlan: InquiryPlan
}

export interface ValidatedInquiryPlanAction {
  tool: string
  capability: 'read' | 'extract' | 'crosscheck' | 'persist'
  rationale: string
  expectedOutput: string
  riskLevel: 'low' | 'medium' | 'high'
  estimatedCost: {
    tokens: number
    latencyMs: number
  }
  input: Record<string, unknown>
}

export interface ValidatedInquiryPlanPayload {
  objective: string
  hypotheses: string[]
  actions: ValidatedInquiryPlanAction[]
  successCriteria: string[]
  stopCriteria: string[]
  confidenceTarget: number
}

export interface ValidatedInquiryFinalAllegation {
  id: string
  statement: string
}

export interface ValidatedInquiryFinalEvidence {
  source_id: string
  source: string
  excerpt: string
  location: EvidenceLocation
  confidence: number
  verification_status: EvidenceVerificationStatus
  verification_notes?: string[]
  page?: number
}

export interface ValidatedInquiryFinalFinding {
  id: string
  claim: string
  status: 'verified' | 'rejected' | 'unverified'
  supportsAllegationIds: string[]
  evidence: ValidatedInquiryFinalEvidence[]
}

export interface ValidatedInquiryFinalPayload {
  scenario: 'positive' | 'negative' | 'plan_another_inquiry'
  confidence: number
  conclusion: string
  allegations: ValidatedInquiryFinalAllegation[]
  findings: ValidatedInquiryFinalFinding[]
}

export type ContractName =
  | 'dig.incremental'
  | 'dig.lines'
  | 'dig.comparison'
  | 'create-lead'
  | 'inquiry.plan'
  | 'inquiry.final'

export interface ContractError {
  path: string
  message: string
}

export type ContractValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ContractError[] }

export function parseStrictJson(raw: string): ContractValidationResult<unknown> {
  const cleaned = stripCodeFence(raw.trim())
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    return {
      ok: false,
      errors: [{ path: '$', message: 'JSON must start with "{" or "[".' }]
    }
  }
  try {
    return { ok: true, value: JSON.parse(cleaned) as unknown }
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: '$',
          message: error instanceof Error ? error.message : 'Invalid JSON payload.'
        }
      ]
    }
  }
}

export function formatContractErrors(errors: ContractError[]): string {
  if (errors.length === 0) return 'Unknown contract error.'
  return errors.map((err) => `${err.path}: ${err.message}`).join(' | ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const list = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  return list
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function parseEvidenceLocation(
  value: unknown,
  fallbackPage: number | undefined,
  errors: ContractError[],
  pathBase: string
): EvidenceLocation | undefined {
  if (!isRecord(value)) {
    if (fallbackPage !== undefined) {
      return {
        kind: 'pdf',
        page: fallbackPage
      }
    }
    return {
      kind: 'unknown',
      hint: 'location_not_provided'
    }
  }

  const kind = asString(value.kind)
  if (kind === 'pdf') {
    const pageRaw = value.page
    const page =
      typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : fallbackPage
    const block = asString(value.block)
    const startOffset =
      typeof value.startOffset === 'number' && Number.isFinite(value.startOffset)
        ? Math.max(0, Math.floor(value.startOffset))
        : undefined
    const endOffset =
      typeof value.endOffset === 'number' && Number.isFinite(value.endOffset)
        ? Math.max(0, Math.floor(value.endOffset))
        : undefined
    const bbox = isRecord(value.bbox)
      ? {
          x: Number(value.bbox.x),
          y: Number(value.bbox.y),
          width: Number(value.bbox.width),
          height: Number(value.bbox.height)
        }
      : undefined
    const hasValidBbox =
      bbox !== undefined &&
      Number.isFinite(bbox.x) &&
      Number.isFinite(bbox.y) &&
      Number.isFinite(bbox.width) &&
      Number.isFinite(bbox.height)
    return {
      kind: 'pdf',
      ...(page !== undefined ? { page } : {}),
      ...(block ? { block } : {}),
      ...(startOffset !== undefined ? { startOffset } : {}),
      ...(endOffset !== undefined ? { endOffset } : {}),
      ...(hasValidBbox ? { bbox } : {})
    }
  }

  if (kind === 'text') {
    const lineStart =
      typeof value.lineStart === 'number' && Number.isFinite(value.lineStart)
        ? Math.max(1, Math.floor(value.lineStart))
        : undefined
    const lineEnd =
      typeof value.lineEnd === 'number' && Number.isFinite(value.lineEnd)
        ? Math.max(1, Math.floor(value.lineEnd))
        : undefined
    const block = asString(value.block)
    const startOffset =
      typeof value.startOffset === 'number' && Number.isFinite(value.startOffset)
        ? Math.max(0, Math.floor(value.startOffset))
        : undefined
    const endOffset =
      typeof value.endOffset === 'number' && Number.isFinite(value.endOffset)
        ? Math.max(0, Math.floor(value.endOffset))
        : undefined
    return {
      kind: 'text',
      ...(lineStart !== undefined ? { lineStart } : {}),
      ...(lineEnd !== undefined ? { lineEnd } : {}),
      ...(block ? { block } : {}),
      ...(startOffset !== undefined ? { startOffset } : {}),
      ...(endOffset !== undefined ? { endOffset } : {})
    }
  }

  if (kind === 'unknown') {
    const hint = asString(value.hint)
    return {
      kind: 'unknown',
      ...(hint ? { hint } : {})
    }
  }

  errors.push({
    path: `${pathBase}.location.kind`,
    message: 'Must be pdf|text|unknown.'
  })
  return undefined
}

export function validateDigIncrementalPayload(
  value: unknown
): ContractValidationResult<DigIncrementalConclusion> {
  const errors: ContractError[] = []
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  const summary = asString(value.summary)
  const keyFindings = asStringArray(value.keyFindings)
  const hypotheses = asStringArray(value.hypotheses)
  const gaps = asStringArray(value.gaps)
  if (!summary) errors.push({ path: 'summary', message: 'Required non-empty string.' })
  if (!keyFindings) errors.push({ path: 'keyFindings', message: 'Required string array.' })
  if (!hypotheses) errors.push({ path: 'hypotheses', message: 'Required string array.' })
  if (!gaps) errors.push({ path: 'gaps', message: 'Required string array.' })
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      summary: summary!,
      keyFindings: keyFindings!,
      hypotheses: hypotheses!,
      gaps: gaps!
    }
  }
}

export function validateDigLinesPayload(value: unknown): ContractValidationResult<DigLinesResult> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  if (!Array.isArray(value.lines)) {
    return { ok: false, errors: [{ path: 'lines', message: 'Required array.' }] }
  }
  const errors: ContractError[] = []
  const lines = value.lines
    .map((line, index) => {
      if (!isRecord(line)) {
        errors.push({ path: `lines[${index}]`, message: 'Expected object.' })
        return undefined
      }
      const title = asString(line.title)
      const description = asString(line.description)
      const rationale = asString(line.rationale)
      const rank = typeof line.rank === 'number' ? Math.max(1, Math.floor(line.rank)) : undefined
      const relatedDocIds = Array.isArray(line.relatedDocIds)
        ? line.relatedDocIds
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .map((item) => item.trim())
        : undefined
      if (!title) errors.push({ path: `lines[${index}].title`, message: 'Required string.' })
      if (!description) {
        errors.push({ path: `lines[${index}].description`, message: 'Required string.' })
      }
      if (!rationale) {
        errors.push({ path: `lines[${index}].rationale`, message: 'Required string.' })
      }
      if (!rank) errors.push({ path: `lines[${index}].rank`, message: 'Required number >= 1.' })
      if (!title || !description || !rationale || !rank) return undefined
      return {
        title,
        description,
        rationale,
        rank,
        ...(relatedDocIds && relatedDocIds.length > 0 ? { relatedDocIds } : {})
      }
    })
    .filter((item): item is DigLinesResult['lines'][number] => Boolean(item))
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { lines } }
}

export function validateDigComparisonPayload(
  value: unknown
): ContractValidationResult<DigComparisonResult> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  const topLinesRaw = value.topLines
  const recommendation = asString(value.recommendation)
  const overlapNotes = asStringArray(value.overlapNotes)
  const errors: ContractError[] = []
  if (!Array.isArray(topLinesRaw)) errors.push({ path: 'topLines', message: 'Required array.' })
  if (!recommendation) errors.push({ path: 'recommendation', message: 'Required string.' })
  if (!overlapNotes) errors.push({ path: 'overlapNotes', message: 'Required string array.' })
  const topLines = Array.isArray(topLinesRaw)
    ? topLinesRaw
        .map((line, index) => {
          if (!isRecord(line)) {
            errors.push({ path: `topLines[${index}]`, message: 'Expected object.' })
            return undefined
          }
          const title = asString(line.title)
          const description = asString(line.description)
          const differentiation = asString(line.differentiation)
          const rank = typeof line.rank === 'number' ? Math.max(1, Math.floor(line.rank)) : undefined
          if (!title) errors.push({ path: `topLines[${index}].title`, message: 'Required string.' })
          if (!description) {
            errors.push({ path: `topLines[${index}].description`, message: 'Required string.' })
          }
          if (!differentiation) {
            errors.push({ path: `topLines[${index}].differentiation`, message: 'Required string.' })
          }
          if (!rank) {
            errors.push({ path: `topLines[${index}].rank`, message: 'Required number >= 1.' })
          }
          if (!title || !description || !differentiation || !rank) return undefined
          return { title, description, differentiation, rank }
        })
        .filter((item): item is DigComparisonResult['topLines'][number] => Boolean(item))
    : []
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      topLines: topLines.slice(0, 3),
      recommendation: recommendation!,
      overlapNotes: overlapNotes!
    }
  }
}

function validateInquiryPlanShape(value: unknown): ContractValidationResult<InquiryPlan> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: 'inquiryPlan', message: 'Expected object.' }] }
  }
  const formulateAllegations = asStringArray(value.formulateAllegations)
  const defineSearchStrategy = asStringArray(value.defineSearchStrategy)
  const gatherFindings = asStringArray(value.gatherFindings)
  const mapToAllegations = asStringArray(value.mapToAllegations)
  const errors: ContractError[] = []
  if (!formulateAllegations) {
    errors.push({ path: 'inquiryPlan.formulateAllegations', message: 'Required string array.' })
  }
  if (!defineSearchStrategy) {
    errors.push({ path: 'inquiryPlan.defineSearchStrategy', message: 'Required string array.' })
  }
  if (!gatherFindings) {
    errors.push({ path: 'inquiryPlan.gatherFindings', message: 'Required string array.' })
  }
  if (!mapToAllegations) {
    errors.push({ path: 'inquiryPlan.mapToAllegations', message: 'Required string array.' })
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      formulateAllegations: formulateAllegations!,
      defineSearchStrategy: defineSearchStrategy!,
      gatherFindings: gatherFindings!,
      mapToAllegations: mapToAllegations!
    }
  }
}

export function validateCreateLeadPayload(
  value: unknown
): ContractValidationResult<ValidatedCreateLeadPayload> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  const codename = asString(value.codename)
  const title = asString(value.title)
  const description = asString(value.description)
  const inquiryPlan = validateInquiryPlanShape(value.inquiryPlan)
  const errors: ContractError[] = []
  if (!codename) errors.push({ path: 'codename', message: 'Required string.' })
  if (!title) errors.push({ path: 'title', message: 'Required string.' })
  if (!description) errors.push({ path: 'description', message: 'Required string.' })
  if (!inquiryPlan.ok) errors.push(...inquiryPlan.errors)
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      codename: codename!,
      title: title!,
      description: description!,
      inquiryPlan: (inquiryPlan as { ok: true; value: InquiryPlan }).value
    }
  }
}

export function validateInquiryPlanPayload(
  value: unknown
): ContractValidationResult<ValidatedInquiryPlanPayload> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  const objective = asString(value.objective)
  const hypotheses = asStringArray(value.hypotheses)
  const successCriteria = asStringArray(value.successCriteria)
  const stopCriteria = asStringArray(value.stopCriteria)
  const confidenceTarget =
    typeof value.confidenceTarget === 'number' && Number.isFinite(value.confidenceTarget)
      ? value.confidenceTarget
      : undefined
  const errors: ContractError[] = []
  if (!objective) errors.push({ path: 'objective', message: 'Required string.' })
  if (!hypotheses) errors.push({ path: 'hypotheses', message: 'Required string array.' })
  if (!successCriteria) errors.push({ path: 'successCriteria', message: 'Required string array.' })
  if (!stopCriteria) errors.push({ path: 'stopCriteria', message: 'Required string array.' })
  if (confidenceTarget === undefined) {
    errors.push({ path: 'confidenceTarget', message: 'Required numeric confidence target.' })
  }
  if (!Array.isArray(value.actions)) {
    errors.push({ path: 'actions', message: 'Required array.' })
  }
  const actions = Array.isArray(value.actions)
    ? value.actions
        .map((action, index) => {
          if (!isRecord(action)) {
            errors.push({ path: `actions[${index}]`, message: 'Expected object.' })
            return undefined
          }
          const tool = asString(action.tool)
          const capability = asString(action.capability)
          const rationale = asString(action.rationale)
          const expectedOutput = asString(action.expectedOutput)
          const riskLevel = asString(action.riskLevel)
          const estimatedCost = isRecord(action.estimatedCost)
            ? {
                tokens:
                  typeof action.estimatedCost.tokens === 'number' &&
                  Number.isFinite(action.estimatedCost.tokens)
                    ? Math.max(0, Math.floor(action.estimatedCost.tokens))
                    : undefined,
                latencyMs:
                  typeof action.estimatedCost.latencyMs === 'number' &&
                  Number.isFinite(action.estimatedCost.latencyMs)
                    ? Math.max(0, Math.floor(action.estimatedCost.latencyMs))
                    : undefined
              }
            : undefined
          const input = isRecord(action.input) ? action.input : undefined
          if (!tool) errors.push({ path: `actions[${index}].tool`, message: 'Required string.' })
          if (
            capability !== 'read' &&
            capability !== 'extract' &&
            capability !== 'crosscheck' &&
            capability !== 'persist'
          ) {
            errors.push({
              path: `actions[${index}].capability`,
              message: 'Must be read|extract|crosscheck|persist.'
            })
          }
          if (!rationale) {
            errors.push({ path: `actions[${index}].rationale`, message: 'Required string.' })
          }
          if (!expectedOutput) {
            errors.push({ path: `actions[${index}].expectedOutput`, message: 'Required string.' })
          }
          if (riskLevel !== 'low' && riskLevel !== 'medium' && riskLevel !== 'high') {
            errors.push({
              path: `actions[${index}].riskLevel`,
              message: 'Must be low|medium|high.'
            })
          }
          if (!estimatedCost || estimatedCost.tokens === undefined || estimatedCost.latencyMs === undefined) {
            errors.push({
              path: `actions[${index}].estimatedCost`,
              message: 'Required object with numeric tokens and latencyMs.'
            })
          }
          if (!input) errors.push({ path: `actions[${index}].input`, message: 'Required object.' })
          if (
            !tool ||
            !capability ||
            !rationale ||
            !expectedOutput ||
            !riskLevel ||
            !estimatedCost ||
            estimatedCost.tokens === undefined ||
            estimatedCost.latencyMs === undefined ||
            !input
          ) {
            return undefined
          }
          return {
            tool,
            capability: capability as ValidatedInquiryPlanAction['capability'],
            rationale,
            expectedOutput,
            riskLevel: riskLevel as ValidatedInquiryPlanAction['riskLevel'],
            estimatedCost: {
              tokens: estimatedCost.tokens,
              latencyMs: estimatedCost.latencyMs
            },
            input
          }
        })
        .filter((item): item is ValidatedInquiryPlanAction => Boolean(item))
    : []
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      objective: objective!,
      hypotheses: hypotheses!,
      actions,
      successCriteria: successCriteria!,
      stopCriteria: stopCriteria!,
      confidenceTarget: confidenceTarget!
    }
  }
}

export function validateInquiryFinalPayload(
  value: unknown
): ContractValidationResult<ValidatedInquiryFinalPayload> {
  if (!isRecord(value)) {
    return { ok: false, errors: [{ path: '$', message: 'Expected JSON object.' }] }
  }
  const scenario = asString(value.scenario)
  const conclusion = asString(value.conclusion)
  const confidence =
    typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? value.confidence
      : undefined
  const errors: ContractError[] = []
  if (
    scenario !== 'positive' &&
    scenario !== 'negative' &&
    scenario !== 'plan_another_inquiry'
  ) {
    errors.push({ path: 'scenario', message: 'Must be positive|negative|plan_another_inquiry.' })
  }
  if (!conclusion) errors.push({ path: 'conclusion', message: 'Required string.' })
  if (confidence === undefined) errors.push({ path: 'confidence', message: 'Required number.' })
  if (!Array.isArray(value.allegations)) errors.push({ path: 'allegations', message: 'Required array.' })
  if (!Array.isArray(value.findings)) errors.push({ path: 'findings', message: 'Required array.' })
  const allegations = Array.isArray(value.allegations)
    ? value.allegations
        .map((item, index) => {
          if (!isRecord(item)) {
            errors.push({ path: `allegations[${index}]`, message: 'Expected object.' })
            return undefined
          }
          const id = asString(item.id)
          const statement = asString(item.statement)
          if (!id) errors.push({ path: `allegations[${index}].id`, message: 'Required string.' })
          if (!statement) {
            errors.push({ path: `allegations[${index}].statement`, message: 'Required string.' })
          }
          if (!id || !statement) return undefined
          return { id, statement }
        })
        .filter((item): item is ValidatedInquiryFinalAllegation => Boolean(item))
    : []
  const findings = Array.isArray(value.findings)
    ? value.findings
        .map((item, index) => {
          if (!isRecord(item)) {
            errors.push({ path: `findings[${index}]`, message: 'Expected object.' })
            return undefined
          }
          const id = asString(item.id)
          const claim = asString(item.claim)
          const status = asString(item.status)
          const supportsAllegationIds = asStringArray(item.supportsAllegationIds)
          if (!Array.isArray(item.evidence)) {
            errors.push({ path: `findings[${index}].evidence`, message: 'Required array.' })
          }
          const evidence = Array.isArray(item.evidence)
            ? item.evidence
                .map((entry, evidenceIdx) => {
                  if (!isRecord(entry)) {
                    errors.push({
                      path: `findings[${index}].evidence[${evidenceIdx}]`,
                      message: 'Expected object.'
                    })
                    return undefined
                  }
                  const source_id = asString(entry.source_id) ?? asString(entry.source)
                  const excerpt = asString(entry.excerpt)
                  const legacyPage =
                    typeof entry.page === 'number' && Number.isFinite(entry.page)
                      ? Math.max(1, Math.floor(entry.page))
                      : undefined
                  const location = parseEvidenceLocation(
                    entry.location,
                    legacyPage,
                    errors,
                    `findings[${index}].evidence[${evidenceIdx}]`
                  )
                  const confidenceRaw = entry.confidence
                  const confidence =
                    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
                      ? clamp01(confidenceRaw)
                      : undefined
                  const verification_status = asString(entry.verification_status)
                  const verification_notes = Array.isArray(entry.verification_notes)
                    ? entry.verification_notes
                        .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
                        .map((note) => note.trim())
                    : undefined
                  if (!source_id) {
                    errors.push({
                      path: `findings[${index}].evidence[${evidenceIdx}].source_id`,
                      message: 'Required string.'
                    })
                  }
                  if (!excerpt) {
                    errors.push({
                      path: `findings[${index}].evidence[${evidenceIdx}].excerpt`,
                      message: 'Required string.'
                    })
                  }
                  if (
                    verification_status !== 'verified' &&
                    verification_status !== 'weak' &&
                    verification_status !== 'missing'
                  ) {
                    errors.push({
                      path: `findings[${index}].evidence[${evidenceIdx}].verification_status`,
                      message: 'Must be verified|weak|missing.'
                    })
                  }
                  if (confidence === undefined) {
                    errors.push({
                      path: `findings[${index}].evidence[${evidenceIdx}].confidence`,
                      message: 'Required number in range 0..1.'
                    })
                  }
                  if (!source_id || !excerpt || !location || confidence === undefined || !verification_status) {
                    return undefined
                  }
                  return {
                    source_id,
                    source: source_id,
                    excerpt,
                    ...(legacyPage ? { page: legacyPage } : {}),
                    location,
                    confidence,
                    verification_status: verification_status as EvidenceVerificationStatus,
                    ...(verification_notes && verification_notes.length > 0
                      ? { verification_notes }
                      : {})
                  }
                })
                .filter((entry): entry is ValidatedInquiryFinalEvidence => Boolean(entry))
            : []
          if (!id) errors.push({ path: `findings[${index}].id`, message: 'Required string.' })
          if (!claim) errors.push({ path: `findings[${index}].claim`, message: 'Required string.' })
          if (status !== 'verified' && status !== 'rejected' && status !== 'unverified') {
            errors.push({
              path: `findings[${index}].status`,
              message: 'Must be unverified|verified|rejected.'
            })
          }
          if (!supportsAllegationIds) {
            errors.push({
              path: `findings[${index}].supportsAllegationIds`,
              message: 'Required string array.'
            })
          }
          if (evidence.length === 0) {
            errors.push({
              path: `findings[${index}].evidence`,
              message: 'At least one evidence item is required.'
            })
          }
          if (!id || !claim || !status || !supportsAllegationIds || evidence.length === 0) {
            return undefined
          }
          return {
            id,
            claim,
            status: status as ValidatedInquiryFinalFinding['status'],
            supportsAllegationIds,
            evidence
          }
        })
        .filter((item): item is ValidatedInquiryFinalFinding => Boolean(item))
    : []
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      scenario: scenario as ValidatedInquiryFinalPayload['scenario'],
      confidence: confidence!,
      conclusion: conclusion!,
      allegations,
      findings
    }
  }
}
