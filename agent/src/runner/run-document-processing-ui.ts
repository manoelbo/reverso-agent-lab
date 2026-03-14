import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import pLimit from 'p-limit'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import type { RuntimeConfig } from '../config/env.js'
import { scanSourceFiles } from '../tools/document-processing/source-indexer.js'
import { loadSourceCheckpoint, markSourceStatus } from '../tools/document-processing/source-checkpoint.js'
import { runStandardProcess, type StepName } from '../tools/document-processing/standard/pipeline.js'

const STEP_LABELS: Record<StepName, string> = {
  preview: 'Gerando preview',
  index: 'Criando índice',
  notes: 'Extraindo notas',
  persons: 'Extraindo pessoas',
  groups: 'Extraindo grupos',
  places: 'Extraindo lugares',
  events: 'Extraindo eventos',
  postprocess: 'Finalizando metadados',
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath, { encoding: 'utf8' })
    return true
  } catch {
    return false
  }
}

async function getFileSizeMB(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath)
    return s.size / (1024 * 1024)
  } catch {
    return 0
  }
}

/**
 * Runs document processing with SSE feedback for the chat UI.
 * Emits queue-start/queue-step-update events for a todo-list view per document.
 * Sub-steps (preview, index, notes...) go to ExecutionTrace via step-start/step-complete.
 * @param fileIds Optional list of docIds to process (if empty, processes all pending)
 */
export async function runDocumentProcessingWithFeedback(
  feedback: UiFeedbackController,
  runtime: RuntimeConfig,
  signal: AbortSignal,
  fileIds?: string[],
): Promise<void> {
  const { paths, apiKey, model, artifactLanguage } = runtime
  const sourceDir = paths.sourceDir

  const scanned = await scanSourceFiles(sourceDir)
  const checkpoint = await loadSourceCheckpoint(sourceDir)
  const checkpointByDocId = new Map((checkpoint?.files ?? []).map((f) => [f.docId, f]))

  let toProcess = scanned.filter((file) => {
    const entry = checkpointByDocId.get(file.docId)
    return !entry || entry.status === 'not_processed' || entry.status === 'failed'
  })

  if (fileIds && fileIds.length > 0) {
    const idSet = new Set(fileIds)
    toProcess = toProcess.filter((f) => idSet.has(f.docId))
  }

  if (toProcess.length === 0) {
    feedback.systemInfo('Nenhum documento pendente de processamento.')
    return
  }

  // Emit queue-start with each document as a step (the to-do list)
  const queueId = randomUUID()
  const queueSteps = toProcess.map((f) => ({ id: f.docId, label: f.originalFileName }))
  feedback.queueStart?.(queueId, queueSteps)

  let processed = 0
  let failed = 0
  const limit = pLimit(3)
  const totalEntities = { persons: 0, groups: 0, places: 0, events: 0 }

  const tasks = toProcess.map((file) =>
    limit(async () => {
      if (signal.aborted) return

      const sizeMB = await getFileSizeMB(file.sourcePath)
      const sizeLabel = sizeMB > 1 ? ` (${sizeMB.toFixed(0)} MB)` : ''

      // Mark document as running in the queue
      feedback.queueStepUpdate?.(queueId, file.docId, 'running')

      // Notify as a consulted source (the PDF is the source)
      feedback.sourceConsulted?.(file.docId, file.originalFileName)

      if (sizeMB > 100) {
        feedback.systemInfo(`${file.originalFileName}${sizeLabel}: arquivo grande — usando extração de texto`)
      }

      const stepId = `doc-${file.docId}`
      feedback.stepStart(stepId, `${file.originalFileName}${sizeLabel}`, 'Iniciando processamento...')

      try {
        const result = await runStandardProcess({
          pdfPath: file.sourcePath,
          artifactDir: file.artifactDir,
          dossierPeopleDir: paths.dossierPeopleDir,
          dossierGroupsDir: paths.dossierGroupsDir,
          dossierPlacesDir: paths.dossierPlacesDir,
          dossierTimelineDir: paths.dossierTimelineDir,
          apiKey,
          model,
          artifactLanguage,
          resume: true,
          onStepStart: (step) => {
            if (signal.aborted) return
            const subStepId = `${stepId}-${step}`
            feedback.stepStart(subStepId, `${file.originalFileName}: ${STEP_LABELS[step] ?? step}...`)
          },
          onStepDone: (step) => {
            const subStepId = `${stepId}-${step}`
            feedback.stepComplete(subStepId)
          },
          onStepError: (step, err) => {
            const subStepId = `${stepId}-${step}`
            feedback.stepError(subStepId, err.message)
          },
          onArtifact: () => {
            // Artifacts are emitted via artifact event — do not emit source-reference for generated files
          },
        })

        totalEntities.persons += (result.artifacts.personsCreated?.length ?? 0) + (result.artifacts.personsUpdated?.length ?? 0)
        totalEntities.groups += (result.artifacts.groupsCreated?.length ?? 0) + (result.artifacts.groupsUpdated?.length ?? 0)
        totalEntities.places += (result.artifacts.placesCreated?.length ?? 0) + (result.artifacts.placesUpdated?.length ?? 0)
        totalEntities.events += result.artifacts.eventsPaths?.length ?? 0

        await markSourceStatus(sourceDir, file.docId, 'done')

        feedback.stepComplete(stepId, 'Preview e metadados gerados')
        feedback.queueStepUpdate?.(queueId, file.docId, 'done')
        processed++

        // Emit preview as an artifact (code block in the message)
        const previewPath = path.join(file.artifactDir, 'preview.md')
        if (await fileExists(previewPath)) {
          try {
            const content = await readFile(previewPath, 'utf8')
            feedback.artifact?.({
              title: `${file.originalFileName} — Preview`,
              content,
              language: 'markdown',
              path: previewPath,
            })
          } catch {
            // non-fatal
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        await markSourceStatus(sourceDir, file.docId, 'failed', { lastError: message })
        feedback.stepError(stepId, `Erro: ${message}`)
        feedback.queueStepUpdate?.(queueId, file.docId, 'error')
        failed++
      }
    }),
  )

  await Promise.all(tasks)

  // If aborted, mark remaining pending steps as aborted
  if (signal.aborted) {
    feedback.queueAbort?.(queueId)
  }

  // Summary text
  const summaryLines: string[] = [
    `Documentos processados: ${processed} de ${toProcess.length}.`,
  ]
  if (failed > 0) {
    summaryLines.push(`Falhas: ${failed} documento(s) com erro.`)
  }
  const entityTotal = totalEntities.persons + totalEntities.groups + totalEntities.places + totalEntities.events
  if (entityTotal > 0) {
    const parts: string[] = []
    if (totalEntities.persons > 0) parts.push(`${totalEntities.persons} pessoa(s)`)
    if (totalEntities.groups > 0) parts.push(`${totalEntities.groups} grupo(s)`)
    if (totalEntities.places > 0) parts.push(`${totalEntities.places} lugar(es)`)
    if (totalEntities.events > 0) parts.push(`${totalEntities.events} evento(s)`)
    summaryLines.push(`Entidades extraídas: ${parts.join(', ')}.`)
  }
  feedback.summary(
    failed > 0 ? 'Processamento concluído com falhas' : 'Processamento concluído',
    summaryLines,
  )

  // Post-processing: suggestions based on state
  const agentMdPath = path.join(paths.outputDir, 'agent.md')
  const hasAgentMd = await fileExists(agentMdPath)

  if (!hasAgentMd && processed > 0) {
    feedback.suggestions?.([
      { id: 'init-context', text: 'Inicializar contexto de investigação' },
      { id: 'view-docs', text: 'Ver documentos processados' },
    ])
    const requestId = randomUUID()
    feedback.requestApproval(
      requestId,
      'Documentos processados. Inicializar o contexto de investigação?',
      'Isso vai analisar os documentos e criar o contexto (agent.md) para o deep-dive.',
    )
  } else if (hasAgentMd && processed > 0) {
    feedback.suggestions?.([
      { id: 'update-context', text: 'Atualizar contexto de investigação' },
      { id: 'deep-dive', text: 'Fazer deep-dive' },
      { id: 'view-docs', text: 'Ver documentos processados' },
    ])
    const requestId = randomUUID()
    feedback.requestApproval(
      requestId,
      'Novos documentos processados. Atualizar o contexto de investigação (agent.md)?',
      'Isso vai refazer o init com os novos documentos incluídos.',
    )
  }
}
