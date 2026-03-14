// @ts-nocheck
/**
 * CLI com subcomandos: process-all, process-selected, process-queue, queue-status, queue-clear, watch, select, rerun.
 */
import path from 'node:path'
import { getProjectRoot, getApiKey } from './config.js'
import { runQueue } from './queue-runner.js'
import { runRerun } from './rerun.js'
import { watchSource } from './source-watcher.js'
import {
  setSourceSelected,
  loadSourceCheckpoint,
  upsertSourceFileEntries,
  setSourceQueued
} from './source-checkpoint.js'
import { computeDocId, scanSourceFiles, toSourceFileEntries } from './source-indexer.js'
import { parseArtifactLanguage } from '../../core/language.js'

const SUBCOMMANDS = [
  'process-all',
  'process-selected',
  'process-queue',
  'queue-status',
  'queue-clear',
  'watch',
  'select',
  'rerun'
] as const
const DEFAULT_SOURCE = 'lab/agent/filesystem/source'
const DEFAULT_MODE = 'standard'
const DEFAULT_MODEL_STANDARD = 'google/gemini-2.0-flash-lite-001'
const DEFAULT_MODEL_DEEP = 'openai/gpt-5-nano'
const DEFAULT_MODEL = DEFAULT_MODEL_STANDARD
const DEFAULT_PREVIEW_MODEL = 'google/gemini-2.5-flash'
const DEFAULT_CHUNK_PAGES = 5
const DEFAULT_CONCURRENCY = 15
/** Feedback estilo init/dig para doc-process quando usuário não passa --feedback. */
const DEFAULT_FEEDBACK_DOC_PROCESS: 'visual' = 'visual'

function getFeedbackMode(
  args: Record<string, string>,
  _processingMode: 'standard' | 'deep'
): 'visual' | 'compact' | 'plain' | undefined {
  const explicit =
    args.feedback === 'visual' || args.feedback === 'compact' || args.feedback === 'plain'
      ? args.feedback
      : undefined
  if (explicit) return explicit
  return DEFAULT_FEEDBACK_DOC_PROCESS
}

function parseKeyValueArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2).replace(/-/g, '')
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      args[key] = 'true'
      continue
    }
    args[key] = value
    i += 1
  }
  return args
}

export function isSourceSubcommand(argv: string[]): boolean {
  const first = argv[0]
  return SUBCOMMANDS.some((c) => c === first)
}

export async function runCli(argv: string[]): Promise<boolean> {
  const sub = argv[0]
  if (!SUBCOMMANDS.includes(sub as (typeof SUBCOMMANDS)[number])) {
    return false
  }
  const rest = argv.slice(1)
  const args = parseKeyValueArgs(rest)
  const projectRoot = getProjectRoot()
  const sourceBase = args.source ?? DEFAULT_SOURCE
  const sourceDir = path.resolve(projectRoot, sourceBase)

  if (sub === 'process-all' || sub === 'process-selected' || sub === 'process-queue') {
    const apiKey = getApiKey()
    const queueMode = sub === 'process-all' ? 'all' : sub === 'process-selected' ? 'selected' : 'queue'
    const processingMode = args.mode === 'deep' ? 'deep' : 'standard'
    const defaultModel = processingMode === 'deep' ? DEFAULT_MODEL_DEEP : DEFAULT_MODEL_STANDARD
    const artifactLanguage = parseArtifactLanguage(args['artifactlanguage']) ?? 'source'
    await runQueue({
      sourceDir,
      mode: queueMode,
      processingMode,
      apiKey,
      model: args.model ?? defaultModel,
      previewModel: args['previewmodel'] ?? DEFAULT_PREVIEW_MODEL,
      maxPages: args['maxpages'] ? Number(args['maxpages']) : undefined,
      chunkPages: Number(args['chunkpages'] ?? DEFAULT_CHUNK_PAGES),
      concurrency: Number(args.concurrency ?? DEFAULT_CONCURRENCY),
      resume: args.resume !== 'false' && args.resume !== '0',
      providerSort:
        args['providersort'] === 'latency' ||
        args['providersort'] === 'throughput' ||
        args['providersort'] === 'price'
          ? args['providersort']
          : undefined,
      debugOpenRouter: args['debugopenrouter'] === 'true' || args['debugopenrouter'] === '1'
      ,
      feedbackMode: getFeedbackMode(args, processingMode),
      artifactLanguage
    })
    return true
  }

  if (sub === 'rerun') {
    const apiKey = getApiKey()
    const processingMode = args.mode === 'deep' ? 'deep' : 'standard'
    const defaultModel = processingMode === 'deep' ? DEFAULT_MODEL_DEEP : DEFAULT_MODEL_STANDARD
    const artifactLanguage = parseArtifactLanguage(args['artifactlanguage']) ?? 'source'
    const inputPath = args.input ?? args.inputpath
    const all = args.all === 'true' || args.all === '1' || !inputPath
    await runRerun({
      sourceDir,
      mode: processingMode,
      all,
      inputPath,
      apiKey,
      model: args.model ?? defaultModel,
      previewModel: args['previewmodel'] ?? DEFAULT_PREVIEW_MODEL,
      maxPages: args['maxpages'] ? Number(args['maxpages']) : undefined,
      chunkPages: Number(args['chunkpages'] ?? DEFAULT_CHUNK_PAGES),
      concurrency: Number(args.concurrency ?? DEFAULT_CONCURRENCY),
      resume: args.resume !== 'false' && args.resume !== '0',
      providerSort:
        args['providersort'] === 'latency' ||
        args['providersort'] === 'throughput' ||
        args['providersort'] === 'price'
          ? args['providersort']
          : undefined,
      debugOpenRouter: args['debugopenrouter'] === 'true' || args['debugopenrouter'] === '1',
      feedbackMode: getFeedbackMode(args, processingMode),
      artifactLanguage
    })
    return true
  }

  if (sub === 'queue-status') {
    let checkpoint = await loadSourceCheckpoint(sourceDir)
    const scanned = await scanSourceFiles(sourceDir)
    const existingByDocId = checkpoint?.files
      ? new Map(checkpoint.files.map((f) => [f.docId, f]))
      : undefined
    const entries = toSourceFileEntries(scanned, existingByDocId)
    checkpoint = await upsertSourceFileEntries(sourceDir, entries)
    const pending = checkpoint.files.filter((f) => f.queuedAt != null && f.status !== 'done')
    if (pending.length === 0) {
      console.log('Nenhum documento na fila (queued e não concluído).')
      return true
    }
    console.log(`Fila: ${pending.length} documento(s) pendente(s)\n`)
    for (const f of pending) {
      const err = f.lastError ? ` — ${f.lastError}` : ''
      console.log(`  ${f.originalFileName} (${f.docId}) — ${f.status}${err}`)
    }
    return true
  }

  if (sub === 'queue-clear') {
    let checkpoint = await loadSourceCheckpoint(sourceDir)
    const scanned = await scanSourceFiles(sourceDir)
    const existingByDocId = checkpoint?.files
      ? new Map(checkpoint.files.map((f) => [f.docId, f]))
      : undefined
    const entries = toSourceFileEntries(scanned, existingByDocId)
    checkpoint = await upsertSourceFileEntries(sourceDir, entries)
    const filesRaw = args.files
    let docIdsToClear: string[]
    if (filesRaw) {
      const names = new Set(filesRaw.split(',').map((s) => s.trim()))
      docIdsToClear = checkpoint.files
        .filter((f) => names.has(f.originalFileName))
        .map((f) => f.docId)
    } else {
      docIdsToClear = checkpoint.files.filter((f) => f.queuedAt != null).map((f) => f.docId)
    }
    if (docIdsToClear.length === 0) {
      console.log('Nenhum documento para remover da fila.')
      return true
    }
    await setSourceQueued(sourceDir, docIdsToClear, null)
    console.log(`${docIdsToClear.length} documento(s) removido(s) da fila.`)
    return true
  }

  if (sub === 'watch') {
    const autoProcess =
      args['autoprocess'] === 'all'
        ? 'all'
        : args['autoprocess'] === 'selected'
          ? 'selected'
          : 'none'
    const processQueueEverySec = args['processqueueevery'] ? Number(args['processqueueevery']) : 0
    const stop = watchSource({
      sourceDir,
      autoProcess,
      onCheckpointUpdated: () => {
        console.log('Checkpoint atualizado.')
      }
    })
    let queueInterval: ReturnType<typeof setInterval> | null = null
    if (processQueueEverySec > 0) {
      let queueRunning = false
      const watchProcessingMode = args.mode === 'deep' ? 'deep' : 'standard'
      const watchDefaultModel = watchProcessingMode === 'deep' ? DEFAULT_MODEL_DEEP : DEFAULT_MODEL_STANDARD
      const artifactLanguage = parseArtifactLanguage(args['artifactlanguage']) ?? 'source'
      const runProcessQueue = (): void => {
        if (queueRunning) return
        queueRunning = true
        runQueue({
          sourceDir,
          mode: 'queue',
          processingMode: watchProcessingMode,
          apiKey: getApiKey(),
          model: args.model ?? watchDefaultModel,
          previewModel: args['previewmodel'] ?? DEFAULT_PREVIEW_MODEL,
          maxPages: args['maxpages'] ? Number(args['maxpages']) : undefined,
          chunkPages: Number(args['chunkpages'] ?? DEFAULT_CHUNK_PAGES),
          concurrency: Number(args.concurrency ?? DEFAULT_CONCURRENCY),
          resume: args.resume !== 'false' && args.resume !== '0',
          providerSort:
            args['providersort'] === 'latency' ||
            args['providersort'] === 'throughput' ||
            args['providersort'] === 'price'
              ? args['providersort']
              : undefined,
          debugOpenRouter: args['debugopenrouter'] === 'true' || args['debugopenrouter'] === '1'
          ,
          feedbackMode: getFeedbackMode(args, watchProcessingMode),
          artifactLanguage
        })
          .catch((err) => console.error('process-queue (watch):', err))
          .finally(() => {
            queueRunning = false
          })
      }
      queueInterval = setInterval(runProcessQueue, processQueueEverySec * 1000)
      console.log(`process-queue a cada ${processQueueEverySec}s`)
    }
    console.log(`Monitorando ${sourceDir}. Ctrl+C para encerrar.`)
    process.on('SIGINT', () => {
      if (queueInterval) clearInterval(queueInterval)
      stop()
      process.exit(0)
    })
    return new Promise<boolean>(() => {})
  }

  if (sub === 'select') {
    const filesRaw = args.files
    const value = args.value === 'true' || args.value === '1'
    if (!filesRaw) {
      throw new Error('select exige --files "a.pdf,b.pdf" e --value true|false')
    }
    const names = filesRaw.split(',').map((s) => s.trim())
    let checkpoint = await loadSourceCheckpoint(sourceDir)
    const scanned = await scanSourceFiles(sourceDir)
    const existingByDocId = checkpoint?.files
      ? new Map(checkpoint.files.map((f) => [f.docId, f]))
      : undefined
    const entries = toSourceFileEntries(scanned, existingByDocId)
    checkpoint = await upsertSourceFileEntries(sourceDir, entries)
    const docIds = names.map((name) => computeDocId(name))
    const existingDocIds = checkpoint.files.map((f) => f.docId)
    const toSet = docIds.filter((id) => existingDocIds.includes(id))
    if (toSet.length === 0) {
      console.log('Nenhum arquivo do checkpoint corresponde à lista informada.')
      return true
    }
    await setSourceSelected(sourceDir, toSet, value)
    console.log(`Seleção atualizada: ${toSet.length} arquivo(s) -> ${value}`)
    return true
  }

  return false
}
