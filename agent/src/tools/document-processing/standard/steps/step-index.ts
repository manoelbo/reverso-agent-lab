import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { callWithCache, type CacheContext } from '../cache-context.js'
import { OpenRouterClient } from '../../openrouter-client.js'
import {
  STANDARD_INDEX_SYSTEM_PROMPT,
  STANDARD_INDEX_USER_PROMPT
} from '../prompts.js'
import type { OpenRouterUsage } from '../../types.js'

export interface StepIndexParams {
  ctx: CacheContext
  artifactDir: string
  artifactLanguageInstruction?: string
  client: OpenRouterClient
  timeoutMs?: number
}

export interface StepIndexResult {
  indexPath: string
  usage: OpenRouterUsage
}

/**
 * Etapa 2: gera index.md (guia pagina a pagina) usando o cache do PDF.
 * Salva em {artifactDir}/index.md.
 */
export async function runStepIndex(params: StepIndexParams): Promise<StepIndexResult> {
  const { content, usage } = await callWithCache(
    params.ctx,
    params.client,
    STANDARD_INDEX_SYSTEM_PROMPT,
    [STANDARD_INDEX_USER_PROMPT, params.artifactLanguageInstruction]
      .filter(Boolean)
      .join('\n\n'),
    params.timeoutMs ?? 180_000
  )

  const indexPath = path.join(params.artifactDir, 'index.md')
  await writeFile(indexPath, `${content}\n`, 'utf8')

  return { indexPath, usage }
}
