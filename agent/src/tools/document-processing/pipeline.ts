// @ts-nocheck
/**
 * Pipeline reutilizável: um documento PDF → réplica, preview, metadata.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { OpenRouterClient } from './openrouter-client.js'
import { buildReplicaWithMistralOcr } from './mistral-ocr-replica.js'
import { buildPreviewAndMetadata } from './preview-metadata-builder.js'
import { loadCheckpoint, saveCheckpoint } from './checkpoint.js'
import { mergeUsage } from './lib/merge-usage.js'
import type { RunReport, OpenRouterUsage } from './types.js'
import {
  buildArtifactLanguageInstruction,
  type ArtifactLanguage
} from '../../core/language.js'

export interface ProcessSingleDocumentParams {
  apiKey: string
  pdfPath: string
  outputDir: string
  chunksDir: string
  checkpointPath: string
  replicaPath: string
  previewPath: string
  metadataPath: string
  reportPath: string
  model: string
  previewModel?: string
  artifactLanguage?: ArtifactLanguage
  maxPages?: number
  chunkPages: number
  concurrency: number
  resume: boolean
  providerSort?: 'latency' | 'throughput' | 'price'
  debugOpenRouter?: boolean
  onReplicaStart?: () => void
  onReplicaDone?: () => void
  onPreviewMetadataStart?: () => void
  onChunkProgress?: (input: {
    current: number
    total: number
    percent: number
    etaMs?: number
    currentPackage?: string
  }) => void
  onArtifact?: (input: {
    stage: 'replica' | 'preview' | 'metadata'
    path: string
    changeType: 'new' | 'edited'
  }) => void
  onDone?: (report: Omit<RunReport, 'startedAt' | 'finishedAt' | 'elapsedMs'>) => void
  onError?: (err: Error) => void
}

export async function processSingleDocument(
  params: ProcessSingleDocumentParams
): Promise<Omit<RunReport, 'startedAt' | 'finishedAt' | 'elapsedMs'>> {
  const client = new OpenRouterClient(params.apiKey)

  await mkdir(params.outputDir, { recursive: true })

  const formatEta = (ms?: number) => {
    if (ms == null || ms < 0) return ''
    const s = Math.round(ms / 1000)
    if (s < 60) return `~${s}s`
    return `~${Math.round(s / 60)}min`
  }

  let ocrResult: {
    replicaMarkdown: string
    totalPagesInPdf: number
    totalChunks: number
    usage: OpenRouterUsage
  }

  const existingCheckpoint = await loadCheckpoint(params.checkpointPath)
  const canSkipReplica =
    params.resume &&
    existingCheckpoint &&
    existingCheckpoint.chunks.length > 0 &&
    existingCheckpoint.chunks.every((c) => c.status === 'done')

  let skippedReplica = false
  if (canSkipReplica) {
    try {
      const replicaMarkdown = await readFile(params.replicaPath, 'utf8')
      const usageFromChunks = mergeUsage(
        existingCheckpoint.chunks
          .map((c) => c.usage)
          .filter((u): u is OpenRouterUsage => u != null)
      )
      ocrResult = {
        replicaMarkdown,
        totalPagesInPdf: existingCheckpoint.totalPages,
        totalChunks: existingCheckpoint.totalChunks,
        usage: usageFromChunks
      }
      skippedReplica = true
      params.onReplicaStart?.()
      params.onReplicaDone?.()
    } catch {
      // replica.md ausente ou ilegível; refaz réplica
    }
  }

  if (!skippedReplica) {
    params.onReplicaStart?.()
    ocrResult = await buildReplicaWithMistralOcr({
      pdfPath: params.pdfPath,
      model: params.model,
      openRouterClient: client,
      maxPages: params.maxPages,
      chunkPages: params.chunkPages,
      concurrency: params.concurrency,
      resume: params.resume,
      chunksDir: params.chunksDir,
      checkpointPath: params.checkpointPath,
      replicaPath: params.replicaPath,
      debugOpenRouter: params.debugOpenRouter,
      ...(params.providerSort ? { provider: { sort: params.providerSort } } : {}),
      onProgress: (ev) => {
        const eta = formatEta(ev.etaMs)
        const pkg = ev.currentPackage ?? ''
        const msg = eta ? `[${ev.percent}%] ${pkg} ETA ${eta}` : `[${ev.percent}%] ${pkg}`
        console.log(msg)
        params.onChunkProgress?.({
          current: ev.current,
          total: ev.total,
          percent: ev.percent,
          etaMs: ev.etaMs,
          currentPackage: ev.currentPackage
        })
      }
    })

    await writeFile(params.replicaPath, ocrResult.replicaMarkdown, 'utf8')
    params.onArtifact?.({ stage: 'replica', path: params.replicaPath, changeType: 'edited' })
    params.onReplicaDone?.()
  }

  const previewModel = params.previewModel ?? params.model
  const artifactLanguageInstruction = buildArtifactLanguageInstruction(
    params.artifactLanguage ?? 'source'
  )
  params.onPreviewMetadataStart?.()

  let checkpoint = await loadCheckpoint(params.checkpointPath)
  if (checkpoint) {
    checkpoint = { ...checkpoint, previewStatus: 'running' as const }
    await saveCheckpoint(params.checkpointPath, checkpoint)
  }

  let previewMetadata
  try {
    previewMetadata = await buildPreviewAndMetadata({
      model: previewModel,
      replicaMarkdown: ocrResult.replicaMarkdown,
      artifactLanguageInstruction,
      openRouterClient: client,
      ...(params.providerSort ? { provider: { sort: params.providerSort } } : {})
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    checkpoint = await loadCheckpoint(params.checkpointPath)
    if (checkpoint) {
      checkpoint = {
        ...checkpoint,
        previewStatus: checkpoint.previewStatus === 'running' ? 'failed' : checkpoint.previewStatus,
        previewError: checkpoint.previewStatus === 'running' ? message : checkpoint.previewError
      }
      await saveCheckpoint(params.checkpointPath, checkpoint)
    }
    const error = err instanceof Error ? err : new Error(String(err))
    params.onError?.(error)
    throw error
  }

  checkpoint = await loadCheckpoint(params.checkpointPath)
  if (checkpoint) {
    const now = new Date().toISOString()
    checkpoint = {
      ...checkpoint,
      previewStatus: 'done',
      metadataStatus: 'done',
      previewFinishedAt: now,
      metadataFinishedAt: now
    }
    await saveCheckpoint(params.checkpointPath, checkpoint)
  }

  await writeFile(params.previewPath, previewMetadata.preview + '\n', 'utf8')
  params.onArtifact?.({ stage: 'preview', path: params.previewPath, changeType: 'edited' })
  await writeFile(params.metadataPath, previewMetadata.metadata + '\n', 'utf8')
  params.onArtifact?.({ stage: 'metadata', path: params.metadataPath, changeType: 'edited' })

  const partial: Omit<RunReport, 'startedAt' | 'finishedAt' | 'elapsedMs'> = {
    inputPdfPath: params.pdfPath,
    outputDir: params.outputDir,
    model: params.model,
    previewModel,
    totalPagesInPdf: ocrResult.totalPagesInPdf,
    totalChunks: ocrResult.totalChunks,
    warnings: [],
    usage: mergeUsage([ocrResult.usage, previewMetadata.usage])
  }
  params.onDone?.(partial)
  return partial
}
