import path from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { writeJsonAtomic } from './fs-io.js'

export interface InquiryLockRecord {
  leadSlug: string
  owner: string
  runId: string
  acquiredAt: string
  heartbeatAt: string
  ttlMs?: number
}

export interface AcquireInquiryLockInput {
  investigationDir: string
  leadSlug: string
  owner: string
  runId: string
  ttlMs?: number
  now?: Date
}

export interface AcquireInquiryLockResult {
  acquired: boolean
  lockPath: string
  reason?: string
  existing?: InquiryLockRecord
}

function normalizeLeadSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) throw new Error('leadSlug invalido para inquiry lock.')
  return slug
}

function lockPathFor(investigationDir: string, leadSlug: string): string {
  return path.join(investigationDir, 'locks', `lead-${normalizeLeadSlug(leadSlug)}.lock.json`)
}

function nowIso(input?: Date): string {
  return (input ?? new Date()).toISOString()
}

function isExpired(record: InquiryLockRecord, nowMs: number): boolean {
  if (typeof record.ttlMs !== 'number' || record.ttlMs <= 0) return false
  const refMs = Date.parse(record.heartbeatAt || record.acquiredAt)
  if (!Number.isFinite(refMs)) return true
  return nowMs - refMs > record.ttlMs
}

async function readLock(lockPath: string): Promise<InquiryLockRecord | undefined> {
  try {
    const raw = await readFile(lockPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<InquiryLockRecord>
    if (
      typeof parsed.leadSlug !== 'string' ||
      typeof parsed.owner !== 'string' ||
      typeof parsed.runId !== 'string' ||
      typeof parsed.acquiredAt !== 'string' ||
      typeof parsed.heartbeatAt !== 'string'
    ) {
      return undefined
    }
    return {
      leadSlug: parsed.leadSlug,
      owner: parsed.owner,
      runId: parsed.runId,
      acquiredAt: parsed.acquiredAt,
      heartbeatAt: parsed.heartbeatAt,
      ...(typeof parsed.ttlMs === 'number' ? { ttlMs: parsed.ttlMs } : {})
    }
  } catch {
    return undefined
  }
}

export async function acquireInquiryLock(
  input: AcquireInquiryLockInput
): Promise<AcquireInquiryLockResult> {
  const leadSlug = normalizeLeadSlug(input.leadSlug)
  const lockPath = lockPathFor(input.investigationDir, leadSlug)
  const current = await readLock(lockPath)
  const nowMs = (input.now ?? new Date()).getTime()
  if (current && !isExpired(current, nowMs)) {
    if (current.owner === input.owner && current.runId === input.runId) {
      const refreshed: InquiryLockRecord = {
        ...current,
        heartbeatAt: nowIso(input.now),
        ...(typeof input.ttlMs === 'number' ? { ttlMs: input.ttlMs } : {})
      }
      await writeJsonAtomic(lockPath, refreshed)
      return { acquired: true, lockPath, existing: refreshed }
    }
    return { acquired: false, lockPath, reason: 'lock_held', existing: current }
  }
  const next: InquiryLockRecord = {
    leadSlug,
    owner: input.owner,
    runId: input.runId,
    acquiredAt: nowIso(input.now),
    heartbeatAt: nowIso(input.now),
    ...(typeof input.ttlMs === 'number' ? { ttlMs: input.ttlMs } : {})
  }
  await writeJsonAtomic(lockPath, next)
  return { acquired: true, lockPath, ...(current ? { existing: current } : {}) }
}

export async function releaseInquiryLock(input: {
  investigationDir: string
  leadSlug: string
  owner: string
  runId: string
}): Promise<boolean> {
  const lockPath = lockPathFor(input.investigationDir, input.leadSlug)
  const current = await readLock(lockPath)
  if (!current) return false
  if (current.owner !== input.owner || current.runId !== input.runId) {
    return false
  }
  try {
    await rm(lockPath)
    return true
  } catch {
    return false
  }
}

export async function withInquiryLock<T>(
  input: AcquireInquiryLockInput & {
    onLocked?: (existing: InquiryLockRecord | undefined) => Promise<T> | T
    run: () => Promise<T>
  }
): Promise<T> {
  const acquired = await acquireInquiryLock(input)
  if (!acquired.acquired) {
    if (input.onLocked) return input.onLocked(acquired.existing)
    throw new Error(
      `Lead bloqueado por outro processo (${acquired.existing?.owner ?? 'unknown'}:${acquired.existing?.runId ?? 'unknown'}).`
    )
  }
  try {
    return await input.run()
  } finally {
    await releaseInquiryLock({
      investigationDir: input.investigationDir,
      leadSlug: input.leadSlug,
      owner: input.owner,
      runId: input.runId
    })
  }
}
