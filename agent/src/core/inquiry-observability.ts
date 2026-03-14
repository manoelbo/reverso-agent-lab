import path from 'node:path'
import { writeJsonAtomic } from './fs-io.js'
import type { EvidenceVerificationMode } from './evidence-semantic-verifier.js'
import type { SensitiveDataPolicyMode } from './sensitive-data-policy.js'

export type InquiryStageName = 'plan' | 'execute' | 'verify' | 'persist'

export interface InquiryStageMetric {
  stage: InquiryStageName
  startedAt: string
  finishedAt?: string
  durationMs?: number
  retries: number
  outcome: 'ok' | 'error' | 'skipped'
  details?: string
}

export interface InquiryRunMetrics {
  version: 1
  runId: string
  leadSlug: string
  startedAt: string
  finishedAt?: string
  durationMs?: number
  stopReason?: string
  evidenceVerificationMode: EvidenceVerificationMode
  sensitiveData: {
    mode: SensitiveDataPolicyMode
    occurrences: number
    blocked: boolean
  }
  findings: {
    parsed: number
    persisted: number
    reviewQueue: number
  }
  gates: {
    evidenceGateEnabled: boolean
    preWriteValidationEnabled: boolean
    criticalWriteGateMode?: string
  }
  stageMetrics: InquiryStageMetric[]
  retries: {
    total: number
    byStage: Record<InquiryStageName, number>
  }
}

export function createInquiryRunMetrics(input: {
  runId: string
  leadSlug: string
  evidenceVerificationMode: EvidenceVerificationMode
  sensitiveDataMode: SensitiveDataPolicyMode
  evidenceGateEnabled: boolean
  preWriteValidationEnabled: boolean
}): InquiryRunMetrics {
  return {
    version: 1,
    runId: input.runId,
    leadSlug: input.leadSlug,
    startedAt: new Date().toISOString(),
    evidenceVerificationMode: input.evidenceVerificationMode,
    sensitiveData: {
      mode: input.sensitiveDataMode,
      occurrences: 0,
      blocked: false
    },
    findings: {
      parsed: 0,
      persisted: 0,
      reviewQueue: 0
    },
    gates: {
      evidenceGateEnabled: input.evidenceGateEnabled,
      preWriteValidationEnabled: input.preWriteValidationEnabled
    },
    stageMetrics: [],
    retries: {
      total: 0,
      byStage: {
        plan: 0,
        execute: 0,
        verify: 0,
        persist: 0
      }
    }
  }
}

export function beginInquiryStage(metrics: InquiryRunMetrics, stage: InquiryStageName): void {
  metrics.stageMetrics.push({
    stage,
    startedAt: new Date().toISOString(),
    retries: 0,
    outcome: 'ok'
  })
}

export function endInquiryStage(
  metrics: InquiryRunMetrics,
  stage: InquiryStageName,
  input?: { outcome?: 'ok' | 'error' | 'skipped'; details?: string }
): void {
  const current = [...metrics.stageMetrics].reverse().find((item) => item.stage === stage && !item.finishedAt)
  if (!current) return
  const finishedAt = new Date().toISOString()
  current.finishedAt = finishedAt
  const started = Date.parse(current.startedAt)
  const finished = Date.parse(finishedAt)
  current.durationMs = Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0
  current.outcome = input?.outcome ?? 'ok'
  if (input?.details) current.details = input.details
}

export function recordInquiryRetry(metrics: InquiryRunMetrics, stage: InquiryStageName): void {
  metrics.retries.total += 1
  metrics.retries.byStage[stage] += 1
  const current = [...metrics.stageMetrics].reverse().find((item) => item.stage === stage && !item.finishedAt)
  if (current) current.retries += 1
}

export function finalizeInquiryMetrics(input: {
  metrics: InquiryRunMetrics
  stopReason: string
  parsedFindings: number
  persistedFindings: number
  reviewQueueFindings: number
  sensitiveOccurrences: number
  sensitiveBlocked: boolean
  criticalWriteGateMode: string
}): InquiryRunMetrics {
  const finishedAt = new Date().toISOString()
  const started = Date.parse(input.metrics.startedAt)
  const finished = Date.parse(finishedAt)
  input.metrics.finishedAt = finishedAt
  input.metrics.durationMs =
    Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : 0
  input.metrics.stopReason = input.stopReason
  input.metrics.findings.parsed = input.parsedFindings
  input.metrics.findings.persisted = input.persistedFindings
  input.metrics.findings.reviewQueue = input.reviewQueueFindings
  input.metrics.sensitiveData.occurrences = input.sensitiveOccurrences
  input.metrics.sensitiveData.blocked = input.sensitiveBlocked
  input.metrics.gates.criticalWriteGateMode = input.criticalWriteGateMode
  return input.metrics
}

export async function writeInquiryMetricsArtifact(input: {
  eventsDir: string
  metrics: InquiryRunMetrics
}): Promise<string> {
  const filePath = path.join(input.eventsDir, `inquiry-metrics-${input.metrics.runId}.json`)
  await writeJsonAtomic(filePath, input.metrics)
  return filePath
}
