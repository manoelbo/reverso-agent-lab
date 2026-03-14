// @ts-nocheck
/**
 * Replica → preview.md + metadata.md: condense (if needed), then preview and metadata via LLM.
 */
import { OpenRouterClient } from './openrouter-client.js'
import {
  CHUNK_CONDENSE_SYSTEM_PROMPT,
  METADATA_SYSTEM_PROMPT,
  PREVIEW_SYSTEM_PROMPT,
  buildChunkCondenseUserPrompt,
  buildMetadataUserPrompt,
  buildPreviewUserPrompt
} from './prompts.js'
import { mergeUsage } from './lib/merge-usage.js'
import type { OpenRouterUsage, PreviewMetadataResult } from './types.js'

const DIRECT_INPUT_LIMIT_CHARS = 120_000
const CHUNK_SIZE_CHARS = 42_000
/** Timeout por requisição na etapa preview/metadata (payload pode ser grande). */
const PREVIEW_METADATA_TIMEOUT_MS = 180_000

/** Concorrência para condense (evita sobrecarga na API). */
const CONDENSE_CONCURRENCY = 3

function chunkText(input: string, maxChars: number): string[] {
  const chunks: string[] = []
  let cursor = 0
  while (cursor < input.length) {
    chunks.push(input.slice(cursor, cursor + maxChars))
    cursor += maxChars
  }
  return chunks
}

async function maybeCondenseReplica(
  replicaMarkdown: string,
  model: string,
  openRouterClient: OpenRouterClient,
  provider?: { sort: 'latency' | 'throughput' | 'price' }
): Promise<{ condensedInput: string; usage: OpenRouterUsage }> {
  if (replicaMarkdown.length <= DIRECT_INPUT_LIMIT_CHARS) {
    return { condensedInput: replicaMarkdown, usage: {} }
  }

  const chunks = chunkText(replicaMarkdown, CHUNK_SIZE_CHARS)
  const notes: string[] = new Array(chunks.length)
  const usages: OpenRouterUsage[] = []

  console.log(
    `  Condensing replica (${chunks.length} chunk(s), ${PREVIEW_METADATA_TIMEOUT_MS / 1000}s timeout each, ${CONDENSE_CONCURRENCY} in parallel)...`
  )

  async function condenseOne(i: number): Promise<{ content: string; usage: OpenRouterUsage }> {
    console.log(`  Condensing chunk ${i + 1}/${chunks.length}...`)
    const response = await openRouterClient.chatMarkdown(
      {
        model,
        temperature: 0.1,
        timeoutMs: PREVIEW_METADATA_TIMEOUT_MS,
        messages: [
          { role: 'system', content: CHUNK_CONDENSE_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildChunkCondenseUserPrompt(i + 1, chunks.length, chunks[i])
          }
        ],
        ...(provider?.sort ? { provider: { sort: provider.sort } } : {})
      },
      2
    )
    return { content: response.content, usage: response.usage }
  }

  for (let start = 0; start < chunks.length; start += CONDENSE_CONCURRENCY) {
    const end = Math.min(start + CONDENSE_CONCURRENCY, chunks.length)
    const batch = await Promise.all(
      Array.from({ length: end - start }, (_, j) => condenseOne(start + j))
    )
    for (let j = 0; j < batch.length; j += 1) {
      const idx = start + j
      notes[idx] = `## Chunk ${idx + 1}\n${batch[j].content}`
      usages.push(batch[j].usage)
    }
  }

  return {
    condensedInput: notes.join('\n\n'),
    usage: mergeUsage(usages)
  }
}

export async function buildPreviewAndMetadata(params: {
  model: string
  replicaMarkdown: string
  openRouterClient: OpenRouterClient
  artifactLanguageInstruction: string
  provider?: { sort: 'latency' | 'throughput' | 'price' }
}): Promise<PreviewMetadataResult> {
  const len = params.replicaMarkdown.length
  if (len <= DIRECT_INPUT_LIMIT_CHARS) {
    console.log(`  Replica ${len.toLocaleString()} chars — sending directly to preview.`)
  } else {
    const n = Math.ceil(len / CHUNK_SIZE_CHARS)
    console.log(
      `  Replica ${len.toLocaleString()} chars — condensing in ${n} chunks before preview.`
    )
  }

  const condensed = await maybeCondenseReplica(
    params.replicaMarkdown,
    params.model,
    params.openRouterClient,
    params.provider
  )

  console.log('  Sending preview request to OpenRouter...')
  const previewResponse = await params.openRouterClient.chatMarkdown(
    {
      model: params.model,
      temperature: 0.2,
      timeoutMs: PREVIEW_METADATA_TIMEOUT_MS,
      messages: [
        { role: 'system', content: PREVIEW_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildPreviewUserPrompt(
            condensed.condensedInput,
            params.artifactLanguageInstruction
          )
        }
      ],
      ...(params.provider?.sort ? { provider: { sort: params.provider.sort } } : {})
    },
    2
  )

  const previewContent = previewResponse.content.trim()
  console.log('  Sending metadata request to OpenRouter...')
  const metadataResponse = await params.openRouterClient.chatMarkdown(
    {
      model: params.model,
      temperature: 0.1,
      timeoutMs: PREVIEW_METADATA_TIMEOUT_MS,
      messages: [
        { role: 'system', content: METADATA_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildMetadataUserPrompt(
            previewContent,
            params.artifactLanguageInstruction
          )
        }
      ],
      ...(params.provider?.sort ? { provider: { sort: params.provider.sort } } : {})
    },
    2
  )

  return {
    preview: previewContent + '\n',
    metadata: metadataResponse.content.trim() + '\n',
    usage: mergeUsage([condensed.usage, previewResponse.usage, metadataResponse.usage])
  }
}
