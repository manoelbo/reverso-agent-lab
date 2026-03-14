// @ts-nocheck
/**
 * Persistência do checkpoint global da pasta source.
 */
import { readFile } from 'node:fs/promises'
import type { SourceCheckpoint, SourceFileEntry, SourceFileStatus } from './types.js'
import { writeJsonAtomic } from '../../core/fs-io.js'

const SOURCE_CHECKPOINT_FILENAME = 'source-checkpoint.json'
const CHECKPOINT_VERSION = 1

export function getSourceCheckpointPath(sourceDir: string): string {
  return `${sourceDir.replace(/\/$/, '')}/${SOURCE_CHECKPOINT_FILENAME}`
}

export async function loadSourceCheckpoint(sourceDir: string): Promise<SourceCheckpoint | null> {
  const path = getSourceCheckpointPath(sourceDir)
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as SourceCheckpoint
    if (data.version == null || !Array.isArray(data.files)) return null
    return data
  } catch {
    return null
  }
}

export async function saveSourceCheckpoint(
  sourceDir: string,
  data: SourceCheckpoint
): Promise<void> {
  const path = getSourceCheckpointPath(sourceDir)
  const next: SourceCheckpoint = {
    ...data,
    updatedAt: new Date().toISOString()
  }
  await writeJsonAtomic(path, next)
}

export function createEmptySourceCheckpoint(sourceDir: string): SourceCheckpoint {
  const now = new Date().toISOString()
  return {
    version: CHECKPOINT_VERSION,
    sourceDir: sourceDir.replace(/\/$/, ''),
    updatedAt: now,
    files: []
  }
}

/**
 * Carrega ou cria o checkpoint; aplica upsert das entradas e salva.
 */
export async function upsertSourceFileEntries(
  sourceDir: string,
  entries: SourceFileEntry[]
): Promise<SourceCheckpoint> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  if (!checkpoint) {
    checkpoint = createEmptySourceCheckpoint(sourceDir)
  }
  const byDocId = new Map(checkpoint.files.map((f) => [f.docId, f]))
  for (const entry of entries) {
    const existing = byDocId.get(entry.docId)
    if (existing) {
      byDocId.set(entry.docId, {
        ...existing,
        ...entry,
        updatedAt: new Date().toISOString()
      })
    } else {
      byDocId.set(entry.docId, entry)
    }
  }
  checkpoint = {
    ...checkpoint,
    files: Array.from(byDocId.values()),
    updatedAt: new Date().toISOString()
  }
  await saveSourceCheckpoint(sourceDir, checkpoint)
  return checkpoint
}

/**
 * Atualiza status (e campos relacionados) de uma entrada por docId e salva.
 */
export async function markSourceStatus(
  sourceDir: string,
  docId: string,
  status: SourceFileStatus,
  extra?: Partial<
    Pick<
      SourceFileEntry,
      | 'lastError'
      | 'startedAt'
      | 'finishedAt'
      | 'resumeFromCheckpoint'
      | 'processingMode'
      | 'attemptCount'
      | 'lastAttemptAt'
      | 'nextRetryAt'
      | 'processingSummary'
    >
  >
): Promise<SourceCheckpoint> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  if (!checkpoint) {
    checkpoint = createEmptySourceCheckpoint(sourceDir)
  }
  const idx = checkpoint.files.findIndex((f) => f.docId === docId)
  if (idx < 0) return checkpoint
  const now = new Date().toISOString()
  const entry: SourceFileEntry = {
    ...checkpoint.files[idx],
    status,
    updatedAt: now,
    ...(extra ?? {})
  }
  if (status === 'replica_running' || status === 'preview_metadata_running') {
    entry.startedAt = entry.startedAt ?? now
  }
  if (status === 'done' || status === 'failed') {
    entry.finishedAt = now
  }
  const files = [...checkpoint.files]
  files[idx] = entry
  checkpoint = {
    ...checkpoint,
    files,
    updatedAt: now
  }
  await saveSourceCheckpoint(sourceDir, checkpoint)
  return checkpoint
}

/**
 * Atualiza campo selected para os docIds informados e salva.
 */
export async function setSourceSelected(
  sourceDir: string,
  docIds: string[],
  selected: boolean
): Promise<SourceCheckpoint> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  if (!checkpoint) {
    checkpoint = createEmptySourceCheckpoint(sourceDir)
  }
  const docIdSet = new Set(docIds)
  const files = checkpoint.files.map((f) =>
    docIdSet.has(f.docId) ? { ...f, selected, updatedAt: new Date().toISOString() } : f
  )
  checkpoint = {
    ...checkpoint,
    files,
    updatedAt: new Date().toISOString()
  }
  await saveSourceCheckpoint(sourceDir, checkpoint)
  return checkpoint
}

/**
 * Atualiza queuedAt para os docIds informados e salva.
 * queuedAt = ISO string para enfileirar, null para remover da fila.
 */
export async function setSourceQueued(
  sourceDir: string,
  docIds: string[],
  queuedAt: string | null
): Promise<SourceCheckpoint> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  if (!checkpoint) {
    checkpoint = createEmptySourceCheckpoint(sourceDir)
  }
  const docIdSet = new Set(docIds)
  const now = new Date().toISOString()
  const files = checkpoint.files.map((f) => {
    if (!docIdSet.has(f.docId)) return f
    const next = { ...f, updatedAt: now }
    if (queuedAt === null) {
      delete next.queuedAt
    } else {
      next.queuedAt = queuedAt
    }
    return next
  })
  checkpoint = {
    ...checkpoint,
    files,
    updatedAt: now
  }
  await saveSourceCheckpoint(sourceDir, checkpoint)
  return checkpoint
}

/**
 * Reseta entradas para rerun: status not_processed e remove campos de processamento.
 * Usado antes de reprocessar documentos (rerun standard ou deep).
 */
export async function resetSourceEntriesForRerun(
  sourceDir: string,
  docIds: string[]
): Promise<SourceCheckpoint> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  if (!checkpoint) {
    checkpoint = createEmptySourceCheckpoint(sourceDir)
  }
  const docIdSet = new Set(docIds)
  const now = new Date().toISOString()
  const files = checkpoint.files.map((f) => {
    if (!docIdSet.has(f.docId)) return f
    const next = { ...f, updatedAt: now, status: 'not_processed' as const }
    delete next.lastError
    delete next.startedAt
    delete next.finishedAt
    delete next.resumeFromCheckpoint
    delete next.processingMode
    delete next.attemptCount
    delete next.lastAttemptAt
    delete next.nextRetryAt
    delete next.processingSummary
    return next
  })
  checkpoint = {
    ...checkpoint,
    files,
    updatedAt: now
  }
  await saveSourceCheckpoint(sourceDir, checkpoint)
  return checkpoint
}
