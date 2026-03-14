// @ts-nocheck
/**
 * Rerun: limpa artefatos do modo (standard ou deep) e reprocessa documentos.
 */
import path from 'node:path'
import { unlink, rm } from 'node:fs/promises'
import { loadSourceCheckpoint, upsertSourceFileEntries, resetSourceEntriesForRerun, setSourceSelected, setSourceQueued } from './source-checkpoint.js'
import { scanSourceFiles, toSourceFileEntries } from './source-indexer.js'
import { runQueue } from './queue-runner.js'
import type { FeedbackMode } from '../../cli/renderer.js'
import type { ArtifactLanguage } from '../../core/language.js'

const STANDARD_FILES = ['preview.md', 'index.md', 'metadata.md', 'standard-checkpoint.json']
const DEEP_FILES = ['replica.md', 'checkpoint.json', 'preview.md', 'metadata.md', 'run-report.json']
const DEEP_CHUNKS_DIR = 'chunks'

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await unlink(filePath)
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e
  }
}

/**
 * Remove artefatos do Standard Process no artifactDir.
 * Não remove replica.md (pode ser de deep anterior).
 */
export async function clearStandardArtifacts(artifactDir: string): Promise<void> {
  for (const name of STANDARD_FILES) {
    await safeUnlink(path.join(artifactDir, name))
  }
}

/**
 * Remove artefatos do Deep Process no artifactDir (replica, chunks, checkpoint OCR, etc.).
 */
export async function clearDeepArtifacts(artifactDir: string): Promise<void> {
  for (const name of DEEP_FILES) {
    await safeUnlink(path.join(artifactDir, name))
  }
  const chunksDir = path.join(artifactDir, DEEP_CHUNKS_DIR)
  try {
    await rm(chunksDir, { recursive: true })
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e
  }
}

export interface RunRerunOptions {
  sourceDir: string
  mode: 'standard' | 'deep'
  /** true = todos os PDFs; false com inputPath = um arquivo */
  all?: boolean
  /** Path ou nome do arquivo para rerun em um único documento */
  inputPath?: string
  apiKey: string
  model: string
  previewModel?: string
  maxPages?: number
  chunkPages: number
  concurrency: number
  resume: boolean
  providerSort?: 'latency' | 'throughput' | 'price'
  debugOpenRouter?: boolean
  feedbackMode?: FeedbackMode
  artifactLanguage?: ArtifactLanguage
}

/**
 * Resolve escopo: --all => todos os PDFs; --input path => um docId.
 * Retorna lista de docIds e entradas correspondentes (para artifactDir).
 */
async function resolveRerunTargets(
  sourceDir: string,
  all: boolean,
  inputPath: string | undefined
): Promise<{ docIds: string[]; entries: Array<{ docId: string; artifactDir: string }> }> {
  let checkpoint = await loadSourceCheckpoint(sourceDir)
  const scanned = await scanSourceFiles(sourceDir)
  const existingByDocId = checkpoint?.files ? new Map(checkpoint.files.map((f) => [f.docId, f])) : undefined
  const entries = toSourceFileEntries(scanned, existingByDocId)
  checkpoint = await upsertSourceFileEntries(sourceDir, entries)

  const pdfEntries = checkpoint.files.filter((f) => f.fileType === 'pdf')
  if (pdfEntries.length === 0) {
    throw new Error('Nenhum PDF encontrado na pasta source.')
  }

  if (inputPath) {
    const basename = path.basename(inputPath)
    const entry = pdfEntries.find((f) => f.originalFileName === basename)
    if (!entry) {
      throw new Error(`Arquivo não encontrado no source: ${basename}. Use --all para reprocessar todos.`)
    }
    return { docIds: [entry.docId], entries: [{ docId: entry.docId, artifactDir: entry.artifactDir }] }
  }

  const docIds = pdfEntries.map((f) => f.docId)
  const entriesWithDir = pdfEntries.map((f) => ({ docId: f.docId, artifactDir: f.artifactDir }))
  return { docIds, entries: entriesWithDir }
}

/**
 * Limpa artefatos do modo, reseta checkpoint e enfileira; em seguida roda a fila.
 */
export async function runRerun(options: RunRerunOptions): Promise<void> {
  const sourceDirAbs = path.resolve(options.sourceDir)
  const all = options.all === true || (!options.inputPath && options.all !== false)
  console.log(`[rerun] Preparando rerun (${options.mode})...`)
  const { docIds, entries } = await resolveRerunTargets(sourceDirAbs, all, options.inputPath)
  console.log(`[rerun] Escopo resolvido: ${entries.length} documento(s).`)

  const clearArtifacts = options.mode === 'deep' ? clearDeepArtifacts : clearStandardArtifacts
  console.log(`[rerun] Limpando artefatos do modo ${options.mode}...`)
  for (const { artifactDir } of entries) {
    await clearArtifacts(artifactDir)
  }

  console.log('[rerun] Resetando checkpoint de source e enfileirando documentos...')
  await resetSourceEntriesForRerun(sourceDirAbs, docIds)
  const now = new Date().toISOString()
  await setSourceSelected(sourceDirAbs, docIds, true)
  await setSourceQueued(sourceDirAbs, docIds, now)

  console.log('[rerun] Iniciando processamento em modo fila...')
  await runQueue({
    sourceDir: sourceDirAbs,
    mode: 'queue',
    processingMode: options.mode,
    apiKey: options.apiKey,
    model: options.model,
    previewModel: options.previewModel,
    maxPages: options.maxPages,
    chunkPages: options.chunkPages,
    concurrency: options.concurrency,
    resume: options.resume,
    providerSort: options.providerSort,
    debugOpenRouter: options.debugOpenRouter,
    feedbackMode: options.feedbackMode,
    artifactLanguage: options.artifactLanguage ?? 'source'
  })
}
