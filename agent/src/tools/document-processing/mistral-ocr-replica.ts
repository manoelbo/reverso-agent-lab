// @ts-nocheck
/**
 * PDF → replica.md via Mistral-OCR (OpenRouter): chunking, parallel requests, checkpoint, incremental replica.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { OpenRouterClient } from './openrouter-client.js'
import type { OpenRouterUsage } from './types.js'
import { getPdfPageCount, splitPdfIntoChunks } from './pdf-split.js'
import {
  buildReplicaFromPdfResponse
} from './replica-from-annotations.js'
import { MISTRAL_OCR_REPLICA_USER_PROMPT } from './prompts.js'
import { loadCheckpoint, saveCheckpoint, createInitialCheckpoint } from './checkpoint.js'
import type { OcrCheckpoint, OcrProgressEvent } from './types.js'

const MISTRAL_OCR_PLUGIN = { id: 'file-parser', pdf: { engine: 'mistral-ocr' as const } }

export interface MistralOcrReplicaResult {
  replicaMarkdown: string
  usage: OpenRouterUsage
  totalChunks: number
  totalPagesInPdf: number
}

export interface BuildReplicaWithMistralOcrParams {
  pdfPath: string
  model: string
  openRouterClient: OpenRouterClient
  timeoutMs?: number
  maxPages?: number
  chunkPages: number
  concurrency: number
  resume: boolean
  chunksDir: string
  checkpointPath: string
  /** Caminho do replica.md; atualizado incrementalmente a cada chunk concluído. */
  replicaPath: string
  /** Se true, grava resposta bruta da API em openrouter-debug-{chunk}.json no diretório de output. */
  debugOpenRouter?: boolean
  /** Preferência de roteamento: priorizar provedores por latência, throughput ou preço. */
  provider?: { sort: 'latency' | 'throughput' | 'price' }
  onProgress?: (ev: OcrProgressEvent) => void
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  return Buffer.from(arr).toString('base64')
}

function chunkLabel(index: number): string {
  return `chunk-${String(index + 1).padStart(2, '0')}`
}

/** Escreve replica.md com todos os chunks já concluídos (em ordem de índice). */
async function flushReplicaIncremental(
  checkpoint: OcrCheckpoint,
  chunks: Array<{ startPage: number; endPage: number }>,
  chunksDir: string,
  replicaPath: string
): Promise<void> {
  const doneIndices = checkpoint.chunks
    .map((c, i) => (c.status === 'done' ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)
  const parts: string[] = []
  for (const i of doneIndices) {
    const label = chunkLabel(i)
    const chunkPath = path.join(chunksDir, `${label}.md`)
    try {
      const content = await readFile(chunkPath, 'utf8')
      parts.push(content)
    } catch {
      parts.push(
        `<!-- Páginas ${chunks[i].startPage}-${chunks[i].endPage} -->\n\n*Failed to process this chunk.*`
      )
    }
  }
  if (parts.length > 0) {
    await writeFile(replicaPath, parts.join('\n\n'), 'utf8')
  }
}

/** Executa até N tarefas em paralelo; ordem de conclusão não é garantida. */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await fn(items[i], i)
    }
  }
  const workers = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
}

/**
 * Gera a réplica em Markdown usando Mistral-OCR via OpenRouter.
 * Chunks configuráveis (ex.: 10 páginas), execução em paralelo, checkpoint/resume e imagens salvas.
 */
export async function buildReplicaWithMistralOcr(
  params: BuildReplicaWithMistralOcrParams
): Promise<MistralOcrReplicaResult> {
  const pageCount = await getPdfPageCount(params.pdfPath)
  const totalPagesToProcess =
    params.maxPages !== undefined ? Math.min(params.maxPages, pageCount) : pageCount
  const client = params.openRouterClient
  const timeoutMs = params.timeoutMs ?? 120_000

  const chunks = await splitPdfIntoChunks(params.pdfPath, params.chunkPages, totalPagesToProcess)
  const totalChunks = chunks.length
  if (totalChunks === 0) {
    return {
      replicaMarkdown: '',
      usage: {},
      totalChunks: 0,
      totalPagesInPdf: pageCount
    }
  }

  await mkdir(params.chunksDir, { recursive: true })

  let checkpoint: OcrCheckpoint | null = null
  if (params.resume) {
    checkpoint = await loadCheckpoint(params.checkpointPath)
    const valid =
      checkpoint &&
      checkpoint.pdfPath === params.pdfPath &&
      checkpoint.totalChunks === totalChunks &&
      checkpoint.chunkPages === params.chunkPages
    if (!valid) checkpoint = null
  }
  if (!checkpoint) {
    checkpoint = createInitialCheckpoint(
      params.pdfPath,
      pageCount,
      totalChunks,
      params.chunkPages,
      chunks.map((c) => ({ startPage: c.startPage, endPage: c.endPage }))
    )
    await saveCheckpoint(params.checkpointPath, checkpoint)
  }

  const chunkTimings: number[] = []
  const startTimes = new Map<number, number>()
  const reportProgress = (doneCount: number, currentPackage?: string, etaMs?: number): void => {
    const total = totalChunks
    const percent = total > 0 ? Math.round((doneCount / total) * 100) : 100
    params.onProgress?.({
      stage: 'chunk_ocr',
      current: doneCount,
      total,
      percent,
      etaMs,
      currentPackage
    })
  }

  const pendingIndices = checkpoint.chunks
    .map((c, i) => (c.status === 'done' ? -1 : i))
    .filter((i) => i >= 0)

  const initialDone = checkpoint.chunks.filter((c) => c.status === 'done').length
  if (initialDone > 0) {
    reportProgress(initialDone, undefined, undefined)
  }
  if (pendingIndices.length === 0) {
    console.log('  All chunks already done (resume). Building replica and generating preview/metadata...')
  } else {
    console.log(`  Processing ${pendingIndices.length} chunk(s) (${totalChunks - initialDone} remaining)...`)
  }

  await runWithConcurrency(pendingIndices, params.concurrency, async (chunkIndex) => {
    const chunk = chunks[chunkIndex]
    const label = chunkLabel(chunkIndex)
    const chunkPath = path.join(params.chunksDir, `${label}.md`)

    console.log(`  Starting chunk ${chunkIndex + 1}/${totalChunks} (pages ${chunk.startPage}-${chunk.endPage})...`)
    checkpoint!.chunks[chunkIndex].status = 'running'
    checkpoint!.chunks[chunkIndex].attempts = (checkpoint!.chunks[chunkIndex].attempts ?? 0) + 1
    await saveCheckpoint(params.checkpointPath, checkpoint!)

    startTimes.set(chunkIndex, Date.now())

    try {
      const dataUrl = `data:application/pdf;base64,${uint8ArrayToBase64(chunk.bytes)}`
      const userPromptText = `${MISTRAL_OCR_REPLICA_USER_PROMPT}\n\nThis segment corresponds to pages ${chunk.startPage} to ${chunk.endPage} of the original document.`
      const result = await client.chatWithPdf(
        {
          model: params.model,
          temperature: 0.1,
          timeoutMs,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: userPromptText },
                { type: 'file', file: { filename: `${label}.pdf`, file_data: dataUrl } }
              ]
            }
          ],
          plugins: [MISTRAL_OCR_PLUGIN],
          ...(params.provider?.sort ? { provider: { sort: params.provider.sort } } : {}),
          debugResponsePath: params.debugOpenRouter
            ? path.join(path.dirname(params.chunksDir), `openrouter-debug-${label}.json`)
            : undefined
        },
        2
      )

      const partMarkdown = buildReplicaFromPdfResponse(result.content, result.annotations)

      const block = `<!-- Páginas ${chunk.startPage}-${chunk.endPage} -->\n\n${partMarkdown}`
      await writeFile(chunkPath, block, 'utf8')

      const elapsed = Date.now() - (startTimes.get(chunkIndex) ?? 0)
      chunkTimings.push(elapsed)
      const elapsedSec = (elapsed / 1000).toFixed(1)
      if (result.annotations.length > 0) {
        console.log(`  Chunk ${chunkIndex + 1}/${totalChunks}: annotations received (${result.annotations.length} file annotation(s)) — ${elapsedSec}s`)
      } else {
        console.log(`  Chunk ${chunkIndex + 1}/${totalChunks}: no annotations (using model content) — ${elapsedSec}s`)
      }

      checkpoint!.chunks[chunkIndex].status = 'done'
      checkpoint!.chunks[chunkIndex].usage = result.usage
      checkpoint!.chunks[chunkIndex].finishedAt = new Date().toISOString()
      await saveCheckpoint(params.checkpointPath, checkpoint!)
      await flushReplicaIncremental(
        checkpoint!,
        chunks.map((c) => ({ startPage: c.startPage, endPage: c.endPage })),
        params.chunksDir,
        params.replicaPath
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      checkpoint!.chunks[chunkIndex].status = 'failed'
      checkpoint!.chunks[chunkIndex].error = message
      checkpoint!.chunks[chunkIndex].finishedAt = new Date().toISOString()
      await saveCheckpoint(params.checkpointPath, checkpoint!)
      throw err
    }

    const doneCount = checkpoint!.chunks.filter((c) => c.status === 'done').length
    const avgMs =
      chunkTimings.length > 0
        ? chunkTimings.reduce((a, b) => a + b, 0) / chunkTimings.length
        : undefined
    const remaining = totalChunks - doneCount
    const etaMs = avgMs !== undefined && remaining > 0 ? Math.round(avgMs * remaining) : undefined
      reportProgress(
      doneCount,
      `chunk ${chunkIndex + 1}/${totalChunks} (pages ${chunk.startPage}-${chunk.endPage})`,
      etaMs
    )
  })

  const parts: string[] = []
  for (let i = 0; i < totalChunks; i += 1) {
    const label = chunkLabel(i)
    const chunkPath = path.join(params.chunksDir, `${label}.md`)
    try {
      const content = await readFile(chunkPath, 'utf8')
      parts.push(content)
    } catch {
      parts.push(
        `<!-- Páginas ${chunks[i].startPage}-${chunks[i].endPage} -->\n\n*Failed to process this chunk.*`
      )
    }
  }

  const replicaMarkdown = parts.join('\n\n')
  const allUsages = checkpoint.chunks.filter((c) => c.usage).map((c) => c.usage!)
  const usage = allUsages.reduce<OpenRouterUsage>(
    (acc, u) => ({
      promptTokens: (acc.promptTokens ?? 0) + (u.promptTokens ?? 0),
      completionTokens: (acc.completionTokens ?? 0) + (u.completionTokens ?? 0),
      totalTokens: (acc.totalTokens ?? 0) + (u.totalTokens ?? 0)
    }),
    {}
  )

  return {
    replicaMarkdown,
    usage,
    totalChunks,
    totalPagesInPdf: pageCount
  }
}
