// @ts-nocheck
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveLabConfig } from './config.js'
import { processSingleDocument } from './pipeline.js'
import { runStandardProcess } from './standard/pipeline.js'
import { resolveLabPaths } from '../../core/paths.js'
import { isSourceSubcommand, runCli } from './cli.js'
import type { RunReport } from './types.js'
import { createFeedbackController } from '../../cli/renderer.js'

async function runLegacy(argv: string[]): Promise<void> {
  const startedAt = new Date()
  const config = resolveLabConfig(argv)

  if (config.mode === 'standard') {
    // Standard Process: envia PDF inteiro ao Gemini com cache entre etapas
    console.log(`Standard Process: ${config.inputPdfPath}`)
    let labPaths = null
    try {
      labPaths = await resolveLabPaths(process.cwd())
    } catch {}

    const filesystemDir = labPaths?.filesystemDir ?? path.dirname(config.outputDir)
    const investigationDir = labPaths?.investigationDir ?? path.join(filesystemDir, 'investigation')
    const dossierDir = labPaths?.dossierDir ?? path.join(filesystemDir, 'dossier')

    const feedback = await createFeedbackController({
      mode: 'compact',
      eventsDir: path.join(filesystemDir, 'events'),
      sessionName: 'doc-process-standard'
    })

    const result = await runStandardProcess({
      pdfPath: config.inputPdfPath,
      artifactDir: config.outputDir,
      dossierPeopleDir: labPaths?.dossierPeopleDir ?? path.join(dossierDir, 'people'),
      dossierGroupsDir: labPaths?.dossierGroupsDir ?? path.join(dossierDir, 'groups'),
      dossierPlacesDir: labPaths?.dossierPlacesDir ?? path.join(dossierDir, 'places'),
      dossierTimelineDir: labPaths?.dossierTimelineDir ?? path.join(dossierDir, 'timeline'),
      apiKey: config.apiKey,
      model: config.model,
          artifactLanguage: config.artifactLanguage ?? 'source',
      resume: config.resume,
      onStepStart: (step) => feedback.stepStart(step, `[${step}]`, 'iniciando'),
      onStepDone: (step) => feedback.stepComplete(step, 'concluído'),
      onStepError: (step, err) => feedback.stepError(step, err.message),
      onInfo: (message) => feedback.systemInfo(message)
    })
    feedback.summary('Standard Process concluído', [
      `Arquivo: ${config.inputPdfPath}`,
      `Usage: ${JSON.stringify(result.usage)}`
    ])
    await feedback.flush()
    console.log(`Standard Process concluido. Usage: ${JSON.stringify(result.usage)}`)
    return
  }

  // Deep Process (modo legado): Mistral OCR -> replica.md
  const partial = await processSingleDocument({
    apiKey: config.apiKey,
    pdfPath: config.inputPdfPath,
    outputDir: config.outputDir,
    chunksDir: config.chunksDir,
    checkpointPath: config.checkpointPath,
    replicaPath: config.replicaPath,
    previewPath: config.previewPath,
    metadataPath: config.metadataPath,
    reportPath: config.reportPath,
    model: config.model,
    previewModel: config.previewModel,
    artifactLanguage: config.artifactLanguage ?? 'source',
    maxPages: config.maxPages,
    chunkPages: config.chunkPages,
    concurrency: config.concurrency,
    resume: config.resume,
    providerSort: config.providerSort,
    debugOpenRouter: config.debugOpenRouter
  })

  const report: RunReport = {
    ...partial,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    elapsedMs: new Date().getTime() - startedAt.getTime()
  }

  await writeFile(config.reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Relatório gerado: ${config.reportPath}`)
}

export async function runDocumentProcessingCommand(argv: string[]): Promise<void> {
  if (isSourceSubcommand(argv)) {
    const handled = await runCli(argv)
    if (handled) return
  }
  await runLegacy(argv)
}

async function main(): Promise<void> {
  await runDocumentProcessingCommand(process.argv.slice(2))
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Erro fatal no laboratório PDF: ${message}`)
    process.exitCode = 1
  })
}
