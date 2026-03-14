// @ts-nocheck
import { resolveRuntimeConfig } from '../../config/env.js'
import type { ToolContext } from '../investigative/context.js'
import { runDocumentProcessingCommand } from './main.js'

export interface ProcessSourceToolInput {
  subcommand:
    | 'process-all'
    | 'process-selected'
    | 'process-queue'
    | 'queue-status'
    | 'queue-clear'
    | 'watch'
    | 'select'
  /** Modo de processamento: "standard" (padrao) ou "deep" (replica Mistral OCR). */
  mode?: 'standard' | 'deep'
  source?: string
  files?: string
  value?: boolean
  model?: string
  previewModel?: string
  maxPages?: number
  chunkPages?: number
  concurrency?: number
  resume?: boolean
  providerSort?: 'latency' | 'throughput' | 'price'
  debugOpenRouter?: boolean
}

export async function processSourceTool(
  input: ProcessSourceToolInput,
  _ctx: ToolContext
): Promise<{ ok: true; argv: string[] }> {
  const runtime = await resolveRuntimeConfig()
  const argv: string[] = [input.subcommand]
  argv.push('--source', input.source ?? runtime.paths.sourceDir)

  if (input.mode) argv.push('--mode', input.mode)
  if (input.files) argv.push('--files', input.files)
  if (typeof input.value === 'boolean') argv.push('--value', String(input.value))
  if (input.model) argv.push('--model', input.model)
  if (input.previewModel) argv.push('--previewmodel', input.previewModel)
  if (typeof input.maxPages === 'number') argv.push('--maxpages', String(input.maxPages))
  if (typeof input.chunkPages === 'number') argv.push('--chunkpages', String(input.chunkPages))
  if (typeof input.concurrency === 'number') argv.push('--concurrency', String(input.concurrency))
  if (typeof input.resume === 'boolean') argv.push('--resume', String(input.resume))
  if (input.providerSort) argv.push('--providersort', input.providerSort)
  if (typeof input.debugOpenRouter === 'boolean') {
    argv.push('--debugopenrouter', String(input.debugOpenRouter))
  }

  await runDocumentProcessingCommand(argv)
  return { ok: true, argv }
}
