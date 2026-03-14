// @ts-nocheck
/**
 * Fila sequencial: processa documentos da pasta source um a um, atualizando checkpoint global.
 */
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { access } from 'node:fs/promises'
import {
  loadSourceCheckpoint,
  saveSourceCheckpoint,
  markSourceStatus,
  upsertSourceFileEntries,
  setSourceQueued
} from './source-checkpoint.js'
import { scanSourceFiles, toSourceFileEntries } from './source-indexer.js'
import { processSingleDocument } from './pipeline.js'
import { runStandardProcess } from './standard/pipeline.js'
import { resolveLabPaths } from '../../core/paths.js'
import { createFeedbackController, type FeedbackMode } from '../../cli/renderer.js'
import type { QueueMode, OpenRouterUsage } from './types.js'
import type { ArtifactLanguage } from '../../core/language.js'
import { writeJsonAtomic, writeUtf8Atomic } from '../../core/fs-io.js'

const DOC_MAX_ATTEMPTS = 3
const DOC_RETRY_BASE_MS = 1500

interface ExecutionPlanDoc {
  docId: string
  fileName: string
  mode: 'standard' | 'deep'
  status: 'pending' | 'in_progress' | 'retrying' | 'completed' | 'failed'
  attempts: number
  lastError?: string
  startedAt?: string
  finishedAt?: string
  nextRetryAt?: string
}

interface ExecutionPlan {
  version: 1
  runId: string
  sourceDir: string
  mode: QueueMode
  processingMode: 'standard' | 'deep'
  createdAt: string
  updatedAt: string
  queueStatus: 'running' | 'idle'
  summary: {
    total: number
    completed: number
    failed: number
    pending: number
    inProgress: number
  }
  docs: ExecutionPlanDoc[]
}

export interface QueueRunnerOptions {
  sourceDir: string
  mode: QueueMode
  /** Modo de processamento: "standard" (padrao) ou "deep" (replica Mistral OCR). */
  processingMode?: 'standard' | 'deep'
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

function nowIso(): string {
  return new Date().toISOString()
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function relPath(filePath: string): string {
  const rel = path.relative(process.cwd(), filePath)
  return rel.length > 0 ? rel : filePath
}

function buildPlanMarkdown(plan: ExecutionPlan): string {
  const lines: string[] = [
    '# doc-process plano de execução',
    '',
    `- runId: ${plan.runId}`,
    `- sourceDir: ${plan.sourceDir}`,
    `- mode: ${plan.mode}`,
    `- processingMode: ${plan.processingMode}`,
    `- queueStatus: ${plan.queueStatus}`,
    `- updatedAt: ${plan.updatedAt}`,
    '',
    '## Resumo',
    '',
    `- total: ${plan.summary.total}`,
    `- completed: ${plan.summary.completed}`,
    `- failed: ${plan.summary.failed}`,
    `- pending: ${plan.summary.pending}`,
    `- inProgress: ${plan.summary.inProgress}`,
    '',
    '## Documentos',
    ''
  ]
  for (const d of plan.docs) {
    const extra = d.lastError ? ` | erro: ${d.lastError}` : ''
    const retry = d.nextRetryAt ? ` | nextRetryAt: ${d.nextRetryAt}` : ''
    lines.push(
      `- [${d.status}] ${d.fileName} (${d.docId}) | tentativas: ${d.attempts}${extra}${retry}`
    )
  }
  lines.push('')
  return lines.join('\n')
}

function recalcPlanSummary(plan: ExecutionPlan): void {
  const completed = plan.docs.filter((d) => d.status === 'completed').length
  const failed = plan.docs.filter((d) => d.status === 'failed').length
  const inProgress = plan.docs.filter((d) => d.status === 'in_progress' || d.status === 'retrying').length
  const pending = plan.docs.length - completed - failed - inProgress
  plan.summary = {
    total: plan.docs.length,
    completed,
    failed,
    pending,
    inProgress
  }
  plan.updatedAt = nowIso()
}

export async function runQueue(options: QueueRunnerOptions): Promise<void> {
  const sourceDirAbs = path.resolve(options.sourceDir)
  await mkdir(sourceDirAbs, { recursive: true })

  let checkpoint = await loadSourceCheckpoint(sourceDirAbs)
  const scanned = await scanSourceFiles(sourceDirAbs)
  const existingByDocId = checkpoint?.files
    ? new Map(checkpoint.files.map((f) => [f.docId, f]))
    : undefined
  const entries = toSourceFileEntries(scanned, existingByDocId)
  checkpoint = await upsertSourceFileEntries(sourceDirAbs, entries)

  const pdfs =
    options.mode === 'queue'
      ? checkpoint.files.filter(
          (f) =>
            f.fileType === 'pdf' &&
            f.queuedAt != null &&
            (f.status === 'not_processed' || f.status === 'failed')
        )
      : options.mode === 'all'
        ? checkpoint.files.filter(
            (f) =>
              f.fileType === 'pdf' &&
              (f.status === 'not_processed' || f.status === 'failed')
          )
        : checkpoint.files.filter(
            (f) =>
              f.selected &&
              f.fileType === 'pdf' &&
              (f.status === 'not_processed' || f.status === 'failed')
          )

  for (const f of pdfs.filter((x) => x.status === 'failed')) {
    const checkpointFile =
      options.processingMode === 'deep'
        ? path.join(f.artifactDir, 'checkpoint.json')
        : path.join(f.artifactDir, 'standard-checkpoint.json')
    try {
      await access(checkpointFile)
      f.resumeFromCheckpoint = true
    } catch {
      f.resumeFromCheckpoint = false
    }
  }
  const toProcess = pdfs.filter((f) => f.status === 'not_processed' || f.status === 'failed')

  if (toProcess.length === 0) {
    console.log('Nenhum documento pendente para processar.')
    return
  }

  if (options.mode === 'all' || options.mode === 'selected') {
    const now = new Date().toISOString()
    await setSourceQueued(sourceDirAbs, toProcess.map((e) => e.docId), now)
  }

  checkpoint = await loadSourceCheckpoint(sourceDirAbs)
  if (checkpoint) {
    checkpoint = { ...checkpoint, queueStatus: 'running', lastRunAt: new Date().toISOString() }
    await saveSourceCheckpoint(sourceDirAbs, checkpoint)
  }

  const processingMode = options.processingMode ?? 'standard'
  const modeLabel = processingMode === 'deep' ? '[deep]' : '[standard]'
  const eventsDir = path.join(path.dirname(sourceDirAbs), 'events')
  await mkdir(eventsDir, { recursive: true })
  const feedback =
    options.feedbackMode
      ? await createFeedbackController({
          mode: options.feedbackMode,
          eventsDir,
          sessionName: 'doc-process-queue'
        })
      : null
  const runId = nowIso().replace(/[:.]/g, '-')
  const planJsonPath = path.join(eventsDir, `doc-process-plan-${runId}.json`)
  const planMdPath = path.join(eventsDir, `doc-process-plan-${runId}.md`)
  const plan: ExecutionPlan = {
    version: 1,
    runId,
    sourceDir: sourceDirAbs,
    mode: options.mode,
    processingMode,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    queueStatus: 'running',
    summary: {
      total: toProcess.length,
      completed: 0,
      failed: 0,
      pending: toProcess.length,
      inProgress: 0
    },
    docs: toProcess.map((entry) => ({
      docId: entry.docId,
      fileName: entry.originalFileName,
      mode: processingMode,
      status: 'pending',
      attempts: entry.attemptCount ?? 0,
      lastError: entry.lastError
    }))
  }
  const persistPlan = async (): Promise<void> => {
    recalcPlanSummary(plan)
    await writeJsonAtomic(planJsonPath, plan)
    await writeUtf8Atomic(planMdPath, buildPlanMarkdown(plan))
  }
  await persistPlan()
  feedback?.step(
    `Plano carregado: ${toProcess.length} documento(s)`,
    'completed',
    `${processingMode} | ${options.mode}`
  )
  feedback?.fileChange({
    path: relPath(planJsonPath),
    changeType: 'new',
    preview: 'Plano de execução persistido (JSON).'
  })
  feedback?.fileChange({
    path: relPath(planMdPath),
    changeType: 'new',
    preview: 'Plano de execução persistido (Markdown).'
  })

  // Para o Standard Process, precisamos dos paths do dossier
  let labPaths = null
  if (processingMode === 'standard') {
    try {
      labPaths = await resolveLabPaths(process.cwd())
    } catch {
      // Usa paths derivados de sourceDirAbs como fallback
    }
  }

  const total = toProcess.length
  let doneCount = 0
  let failedCount = 0

  for (let i = 0; i < toProcess.length; i += 1) {
    const entry = toProcess[i]
    const current = i + 1
    console.log(`\n[${current}/${total}] ${modeLabel} ${entry.originalFileName} (${entry.docId})`)
    feedback?.step(`[${current}/${total}] ${entry.originalFileName}`, 'in_progress', processingMode)
    const planDoc = plan.docs.find((d) => d.docId === entry.docId)
    if (planDoc) {
      planDoc.status = 'in_progress'
      planDoc.startedAt = planDoc.startedAt ?? nowIso()
      await persistPlan()
    }
    const outputDir = entry.artifactDir
    let completed = false
    let attempt = 0
    while (!completed && attempt < DOC_MAX_ATTEMPTS) {
      attempt += 1
      const attemptAt = nowIso()
      await markSourceStatus(sourceDirAbs, entry.docId, 'replica_running', {
        processingMode,
        attemptCount: attempt,
        lastAttemptAt: attemptAt,
        nextRetryAt: undefined
      })
      if (planDoc) {
        planDoc.attempts = attempt
        planDoc.nextRetryAt = undefined
        planDoc.status = attempt > 1 ? 'retrying' : 'in_progress'
        await persistPlan()
      }

      try {
        if (processingMode === 'standard') {
          const dossierDir = labPaths?.dossierDir ?? path.join(path.dirname(sourceDirAbs), 'dossier')
          console.log(`  Standard Process: iniciando... (tentativa ${attempt}/${DOC_MAX_ATTEMPTS})`)
          const result = await runStandardProcess({
            pdfPath: entry.sourcePath,
            artifactDir: outputDir,
            dossierPeopleDir: labPaths?.dossierPeopleDir ?? path.join(dossierDir, 'people'),
            dossierGroupsDir: labPaths?.dossierGroupsDir ?? path.join(dossierDir, 'groups'),
            dossierPlacesDir: labPaths?.dossierPlacesDir ?? path.join(dossierDir, 'places'),
            dossierTimelineDir: labPaths?.dossierTimelineDir ?? path.join(dossierDir, 'timeline'),
            apiKey: options.apiKey,
            model: options.model,
            artifactLanguage: options.artifactLanguage ?? 'source',
            resume: options.resume,
            onStepStart: (step) => {
              console.log(`  [${step}] iniciando...`)
              feedback?.step(`${entry.originalFileName} :: ${step}`, 'in_progress')
            },
            onStepDone: (step) => {
              console.log(`  [${step}] concluido.`)
              feedback?.step(`${entry.originalFileName} :: ${step}`, 'completed')
            },
            onStepError: (step, err) => {
              console.error(`  [${step}] erro: ${err.message}`)
              feedback?.step(`${entry.originalFileName} :: ${step}`, 'blocked', err.message)
            },
            onInfo: (message) => feedback?.info(message),
            onArtifact: (artifact) => {
              feedback?.fileChange({
                path: relPath(artifact.path),
                changeType: artifact.changeType,
                preview: `${entry.originalFileName} :: ${artifact.step}`
              })
            }
          })
          console.log(`  Standard Process: concluido.`)

          await markSourceStatus(sourceDirAbs, entry.docId, 'done', {
            processingMode: 'standard',
            attemptCount: attempt,
            lastAttemptAt: attemptAt,
            nextRetryAt: undefined,
            lastError: undefined,
            processingSummary: {
              usage: result.usage,
              model: options.model
            }
          })
        } else {
          const chunksDir = path.join(outputDir, 'chunks')
          const checkpointPath = path.join(outputDir, 'checkpoint.json')
          const replicaPath = path.join(outputDir, 'replica.md')
          const previewPath = path.join(outputDir, 'preview.md')
          const metadataPath = path.join(outputDir, 'metadata.md')
          const reportPath = path.join(outputDir, 'run-report.json')

          let lastReport: {
            totalPagesInPdf?: number
            totalChunks?: number
            usage?: OpenRouterUsage
          } = {}
          let lastChunkPercent = -1
          await processSingleDocument({
            apiKey: options.apiKey,
            pdfPath: entry.sourcePath,
            outputDir,
            chunksDir,
            checkpointPath,
            replicaPath,
            previewPath,
            metadataPath,
            reportPath,
            model: options.model,
            previewModel: options.previewModel,
            artifactLanguage: options.artifactLanguage ?? 'source',
            maxPages: options.maxPages,
            chunkPages: options.chunkPages,
            concurrency: options.concurrency,
            resume: options.resume,
            providerSort: options.providerSort,
            debugOpenRouter: options.debugOpenRouter,
            onReplicaStart: () => {
              console.log(`  Réplica: iniciando...`)
              feedback?.step(`${entry.originalFileName} :: replica`, 'in_progress')
            },
            onReplicaDone: () => {
              console.log(`  Réplica: concluída.`)
              feedback?.step(`${entry.originalFileName} :: replica`, 'completed')
            },
            onPreviewMetadataStart: () => {
              markSourceStatus(sourceDirAbs, entry.docId, 'preview_metadata_running', {
                processingMode,
                attemptCount: attempt,
                lastAttemptAt: attemptAt
              }).catch(() => {})
              console.log(`  Preview/metadata: iniciando...`)
            },
            onChunkProgress: (progress) => {
              if (progress.percent - lastChunkPercent >= 10 || progress.percent === 100) {
                lastChunkPercent = progress.percent
                feedback?.info(
                  `${entry.originalFileName} :: chunk_ocr ${progress.current}/${progress.total} (${progress.percent}%)`
                )
              }
            },
            onArtifact: (artifact) => {
              feedback?.fileChange({
                path: relPath(artifact.path),
                changeType: artifact.changeType,
                preview: `${entry.originalFileName} :: ${artifact.stage}`
              })
            },
            onDone: (report) => {
              lastReport = report
              console.log(`  Concluído.`)
            },
            onError: () => {}
          })

          const runReport = {
            startedAt: attemptAt,
            finishedAt: nowIso(),
            elapsedMs: Math.max(0, Date.parse(nowIso()) - Date.parse(attemptAt)),
            inputPdfPath: entry.sourcePath,
            outputDir,
            model: options.model,
            previewModel: options.previewModel ?? options.model,
            totalPagesInPdf: lastReport.totalPagesInPdf,
            totalChunks: lastReport.totalChunks,
            warnings: [],
            usage: lastReport.usage ?? {}
          }
          await writeJsonAtomic(reportPath, runReport)
          feedback?.fileChange({
            path: relPath(reportPath),
            changeType: 'edited',
            preview: `${entry.originalFileName} :: run-report`
          })

          await markSourceStatus(sourceDirAbs, entry.docId, 'done', {
            processingMode: 'deep',
            attemptCount: attempt,
            lastAttemptAt: attemptAt,
            nextRetryAt: undefined,
            lastError: undefined,
            processingSummary: {
              totalPagesInPdf: lastReport.totalPagesInPdf,
              totalChunks: lastReport.totalChunks,
              usage: lastReport.usage,
              model: options.model,
              previewModel: options.previewModel ?? options.model
            }
          })
        }

        completed = true
        doneCount += 1
        if (planDoc) {
          planDoc.status = 'completed'
          planDoc.finishedAt = nowIso()
          planDoc.lastError = undefined
          planDoc.nextRetryAt = undefined
          await persistPlan()
        }
        feedback?.step(entry.originalFileName, 'completed')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  Erro: ${message}`)
        const hasRetry = attempt < DOC_MAX_ATTEMPTS
        const retryDelayMs = Math.min(12_000, DOC_RETRY_BASE_MS * 2 ** (attempt - 1))
        const nextRetryAt = hasRetry ? new Date(Date.now() + retryDelayMs).toISOString() : undefined
        await markSourceStatus(sourceDirAbs, entry.docId, 'failed', {
          lastError: message,
          processingMode,
          attemptCount: attempt,
          lastAttemptAt: attemptAt,
          nextRetryAt
        })
        if (planDoc) {
          planDoc.attempts = attempt
          planDoc.lastError = message
          planDoc.nextRetryAt = nextRetryAt
          if (hasRetry) {
            planDoc.status = 'retrying'
          } else {
            planDoc.status = 'failed'
            planDoc.finishedAt = nowIso()
          }
          await persistPlan()
        }
        if (!hasRetry) {
          failedCount += 1
          feedback?.step(entry.originalFileName, 'blocked', message)
          break
        }
        feedback?.warn(
          `${entry.originalFileName}: tentativa ${attempt}/${DOC_MAX_ATTEMPTS} falhou; retry em ${retryDelayMs}ms`
        )
        await waitMs(retryDelayMs)
      }
    }
  }

  checkpoint = await loadSourceCheckpoint(sourceDirAbs)
  if (checkpoint) {
    checkpoint = { ...checkpoint, queueStatus: 'idle' }
    await saveSourceCheckpoint(sourceDirAbs, checkpoint)
  }
  plan.queueStatus = 'idle'
  await persistPlan()
  const summary =
    failedCount > 0
      ? `${doneCount} concluído(s), ${failedCount} falha(s). Rode process-all de novo para reprocessar os que falharam.`
      : `${total} documento(s) processado(s).`
  console.log(`\nFila concluída: ${summary}`)
  if (feedback) {
    feedback.systemInfo(`Plano JSON: ${relPath(planJsonPath)}`)
    feedback.systemInfo(`Plano MD: ${relPath(planMdPath)}`)
    feedback.summary('doc-process queue finalizado', [
      summary,
      `Plano persistido: ${relPath(planMdPath)}`
    ])
    await feedback.flush()
  }
}
