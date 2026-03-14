// @ts-nocheck
/**
 * Scan da pasta source: descobre arquivos, gera docId e artifactDir.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { SourceFileEntry } from './types.js'

const ARTIFACTS_DIR = '.artifacts'
const SOURCE_CHECKPOINT_FILENAME = 'source-checkpoint.json'

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function shortHash(input: string, length = 8): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length)
}

function getFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '')
  return ext || 'unknown'
}

/**
 * Gera docId estável: slug(nomeSemExt)-shortHash(nomeOriginal).
 */
export function computeDocId(originalFileName: string): string {
  const base = path.basename(originalFileName, path.extname(originalFileName))
  const slug = slugify(base) || 'doc'
  const hash = shortHash(originalFileName)
  return `${slug}-${hash}`
}

export interface ScannedFile {
  sourcePath: string
  originalFileName: string
  fileType: string
  docId: string
  artifactDir: string
}

/**
 * Lista arquivos em sourceDir (apenas arquivos, sem recursão).
 * Ignora diretórios ocultos, .artifacts e source-checkpoint.json.
 */
export async function scanSourceFiles(sourceDirAbs: string): Promise<ScannedFile[]> {
  const normalized = sourceDirAbs.replace(/\/$/, '')
  const entries = await readdir(normalized, { withFileTypes: true })
  const result: ScannedFile[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    if (e.name === SOURCE_CHECKPOINT_FILENAME) continue
    if (e.isDirectory()) continue
    const sourcePath = path.join(normalized, e.name)
    const originalFileName = e.name
    const fileType = getFileType(originalFileName)
    const docId = computeDocId(originalFileName)
    const artifactDir = path.join(normalized, ARTIFACTS_DIR, docId)
    result.push({ sourcePath, originalFileName, fileType, docId, artifactDir })
  }
  return result
}

/**
 * Converte arquivos escaneados em SourceFileEntry, mesclando com estado existente quando fornecido.
 */
export function toSourceFileEntries(
  scanned: ScannedFile[],
  existingByDocId?: Map<string, SourceFileEntry>
): SourceFileEntry[] {
  const now = new Date().toISOString()
  return scanned.map((s) => {
    const existing = existingByDocId?.get(s.docId)
    return {
      docId: s.docId,
      originalFileName: s.originalFileName,
      sourcePath: s.sourcePath,
      fileType: s.fileType,
      artifactDir: s.artifactDir,
      selected: existing?.selected ?? false,
      status: existing?.status ?? 'not_processed',
      lastError: existing?.lastError,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      startedAt: existing?.startedAt,
      finishedAt: existing?.finishedAt,
      resumeFromCheckpoint: existing?.resumeFromCheckpoint,
      processingSummary: existing?.processingSummary
    }
  })
}
