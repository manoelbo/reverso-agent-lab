import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { buildCacheContext, type CacheContext } from '../cache-context.js'
import { OpenRouterClient } from '../../openrouter-client.js'
import {
  STANDARD_PREVIEW_SYSTEM_PROMPT,
  STANDARD_PREVIEW_USER_PROMPT
} from '../prompts.js'
import type { OpenRouterUsage } from '../../types.js'

export interface StepPreviewParams {
  pdfPath: string
  sourceFileName: string
  artifactDir: string
  model: string
  artifactLanguageInstruction?: string
  client: OpenRouterClient
  timeoutMs?: number
}

export interface StepPreviewResult {
  ctx: CacheContext
  previewPath: string
  usage: OpenRouterUsage
}

/**
 * Etapa 1: envia o PDF inteiro ao Gemini, gera preview.md e cria CacheContext.
 * O CacheContext e reutilizado em todas as etapas seguintes.
 */
export async function runStepPreview(params: StepPreviewParams): Promise<StepPreviewResult> {
  await mkdir(params.artifactDir, { recursive: true })

  const { ctx, content, usage } = await buildCacheContext({
    pdfPath: params.pdfPath,
    sourceFileName: params.sourceFileName,
    model: params.model,
    systemPrompt: STANDARD_PREVIEW_SYSTEM_PROMPT,
    userPrompt: [STANDARD_PREVIEW_USER_PROMPT, params.artifactLanguageInstruction]
      .filter(Boolean)
      .join('\n\n'),
    client: params.client,
    timeoutMs: params.timeoutMs ?? 180_000
  })

  const previewPath = path.join(params.artifactDir, 'preview.md')
  await writeFile(previewPath, `${content}\n`, 'utf8')

  return { ctx, previewPath, usage }
}
