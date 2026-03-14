import { acquireInquiryLock, releaseInquiryLock } from '../core/inquiry-lock.js'

export interface InquiryBatchFailure {
  slug: string
  message: string
}

export interface InquiryBatchSkip {
  slug: string
  reason: string
}

export interface InquiryBatchConcurrentResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  succeededLeads: string[]
  failedLeads: InquiryBatchFailure[]
  skippedLeads: InquiryBatchSkip[]
}

export interface RunInquiryBatchConcurrentInput {
  leads: string[]
  investigationDir: string
  owner?: string
  runId?: string
  maxConcurrency: number
  lockTtlMs?: number
  runOne: (leadSlug: string) => Promise<void>
}

interface LeadExecutionResult {
  slug: string
  index: number
  outcome: 'success' | 'failed' | 'skipped'
  message?: string
}

function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(1, Math.floor(value))
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

export async function runInquiryBatchConcurrent(
  input: RunInquiryBatchConcurrentInput
): Promise<InquiryBatchConcurrentResult> {
  const startedAt = new Date().toISOString()
  const startedAtMs = Date.now()
  const maxConcurrency = normalizeConcurrency(input.maxConcurrency)
  const owner = input.owner?.trim() || 'inquiry-batch'
  const runId =
    input.runId?.trim() ||
    `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const queue = input.leads.map((slug, index) => ({ slug: normalizeSlug(slug), index }))
  const seen = new Set<string>()
  const immediateResults: LeadExecutionResult[] = []
  const pending = queue.filter((item) => {
    if (!item.slug) {
      immediateResults.push({
        slug: item.slug,
        index: item.index,
        outcome: 'skipped',
        message: 'lead_slug_empty'
      })
      return false
    }
    if (seen.has(item.slug)) {
      immediateResults.push({
        slug: item.slug,
        index: item.index,
        outcome: 'skipped',
        message: 'duplicate_lead_in_batch'
      })
      return false
    }
    seen.add(item.slug)
    return true
  })

  let cursor = 0
  const allResults: LeadExecutionResult[] = [...immediateResults]
  const workerCount = Math.min(maxConcurrency, Math.max(1, pending.length))

  const worker = async (): Promise<void> => {
    while (true) {
      const current = pending[cursor]
      cursor += 1
      if (!current) return
      const lock = await acquireInquiryLock({
        investigationDir: input.investigationDir,
        leadSlug: current.slug,
        owner,
        runId,
        ...(typeof input.lockTtlMs === 'number' ? { ttlMs: input.lockTtlMs } : {})
      })
      if (!lock.acquired) {
        allResults.push({
          slug: current.slug,
          index: current.index,
          outcome: 'skipped',
          message:
            lock.reason === 'lock_held'
              ? `lock_held_by_${lock.existing?.owner ?? 'unknown'}`
              : 'lock_not_acquired'
        })
        continue
      }
      try {
        await input.runOne(current.slug)
        allResults.push({ slug: current.slug, index: current.index, outcome: 'success' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        allResults.push({
          slug: current.slug,
          index: current.index,
          outcome: 'failed',
          message
        })
      } finally {
        await releaseInquiryLock({
          investigationDir: input.investigationDir,
          leadSlug: current.slug,
          owner,
          runId
        })
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  const ordered = allResults.sort((a, b) => a.index - b.index)
  const succeededLeads = ordered.filter((item) => item.outcome === 'success').map((item) => item.slug)
  const failedLeads = ordered
    .filter((item) => item.outcome === 'failed')
    .map((item) => ({ slug: item.slug, message: item.message ?? 'unknown_error' }))
  const skippedLeads = ordered
    .filter((item) => item.outcome === 'skipped')
    .map((item) => ({ slug: item.slug, reason: item.message ?? 'skipped' }))
  const finishedAt = new Date().toISOString()
  return {
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.now() - startedAtMs),
    succeededLeads,
    failedLeads,
    skippedLeads
  }
}
