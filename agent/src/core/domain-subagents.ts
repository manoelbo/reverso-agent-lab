import type { FindingEvidence } from './contracts.js'
import type { StructuredExecutionPlan } from './orchestration.js'

export type InvestigationDomain =
  | 'corporate'
  | 'contracts'
  | 'timeline'
  | 'financial'
  | 'legal'

export interface DomainSubagentPlan {
  domain: InvestigationDomain
  objective: string
  readOnlyContext: string
  maxEvidenceItems: number
}

export interface DomainSubagentResult {
  domain: InvestigationDomain
  ok: boolean
  summary: string
  evidence: FindingEvidence[]
  warnings: string[]
}

export interface DomainCoordinatorResult {
  outputs: DomainSubagentResult[]
  consolidatedEvidence: FindingEvidence[]
  warnings: string[]
}

export type DomainSubagentExecutor = (
  plan: DomainSubagentPlan
) => Promise<DomainSubagentResult> | DomainSubagentResult

export function buildDefaultDomainPlans(plan: StructuredExecutionPlan, sourceSummary: string): DomainSubagentPlan[] {
  const objective = plan.objective || 'Expand investigation with domain-specific checks.'
  const compactContext = sourceSummary.trim().slice(0, 1600)
  return (['corporate', 'contracts', 'timeline'] as InvestigationDomain[]).map((domain) => ({
    domain,
    objective,
    readOnlyContext: compactContext,
    maxEvidenceItems: 8
  }))
}

export async function runDomainSubagents(input: {
  plans: DomainSubagentPlan[]
  executor: DomainSubagentExecutor
  maxDomains?: number
  timeoutMs?: number
}): Promise<DomainCoordinatorResult> {
  const maxDomains = Math.max(1, Math.floor(input.maxDomains ?? input.plans.length))
  const timeoutMs = Math.max(50, Math.floor(input.timeoutMs ?? 2_500))
  const selectedPlans = input.plans.slice(0, maxDomains)
  const outputs: DomainSubagentResult[] = []
  const warnings: string[] = []

  for (const plan of selectedPlans) {
    try {
      const result = await withTimeout(input.executor(plan), timeoutMs)
      outputs.push(normalizeSubagentResult(result, plan.domain))
    } catch (error) {
      warnings.push(`subagent_failed:${plan.domain}`)
      outputs.push({
        domain: plan.domain,
        ok: false,
        summary: 'Subagent failed before returning evidence.',
        evidence: [],
        warnings: [error instanceof Error ? error.message : String(error)]
      })
    }
  }

  const consolidatedEvidence = consolidateDomainEvidence(outputs)
  return {
    outputs,
    consolidatedEvidence,
    warnings: dedupeStrings(warnings)
  }
}

export function consolidateDomainEvidence(results: DomainSubagentResult[]): FindingEvidence[] {
  const deduped = new Map<string, FindingEvidence>()
  for (const result of results) {
    for (const evidence of result.evidence) {
      const key = `${evidence.source_id}:${evidence.excerpt}`.toLowerCase()
      if (!deduped.has(key)) {
        deduped.set(key, evidence)
      }
    }
  }
  return Array.from(deduped.values())
}

function normalizeSubagentResult(result: DomainSubagentResult, domain: InvestigationDomain): DomainSubagentResult {
  return {
    ...result,
    domain,
    summary: result.summary.trim() || 'No summary generated.',
    evidence: Array.isArray(result.evidence) ? result.evidence : [],
    warnings: Array.isArray(result.warnings) ? dedupeStrings(result.warnings) : []
  }
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

async function withTimeout<T>(promise: Promise<T> | T, timeoutMs: number): Promise<T> {
  const timeoutToken = Symbol('timeout')
  const timed = await Promise.race([
    Promise.resolve(promise),
    new Promise<typeof timeoutToken>((resolve) => {
      const timeout = setTimeout(() => resolve(timeoutToken), timeoutMs)
      timeout.unref?.()
    })
  ])
  if (timed === timeoutToken) {
    throw new Error(`domain_subagent_timeout:${timeoutMs}ms`)
  }
  return timed
}
