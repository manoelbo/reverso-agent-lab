import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { callWithCache, type CacheContext } from '../cache-context.js'
import { OpenRouterClient } from '../../openrouter-client.js'
import {
  STANDARD_EVENTS_SYSTEM_PROMPT,
  STANDARD_EVENTS_USER_PROMPT
} from '../prompts.js'
import { extractJsonArray, repairTruncatedJsonArray } from '../../../../core/markdown.js'
import { ensureDir } from '../../../../core/fs-io.js'
import { upsertTimelineEvent } from '../dedup/event-dedup.js'
import type { EventExtraction } from '../../../../core/contracts.js'
import type { OpenRouterUsage } from '../../types.js'

export interface StepEventsParams {
  ctx: CacheContext
  timelineDir: string
  artifactLanguageInstruction?: string
  client: OpenRouterClient
  timeoutMs?: number
}

export interface StepEventsResult {
  created: string[]
  eventsPaths: string[]
  usage: OpenRouterUsage
}

function buildTimelineHeader(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0')
  return [
    '---',
    'type: timeline',
    `year: ${year}`,
    `month: ${month}`,
    'events_count: 0',
    'tags: []',
    '---',
    '',
    `# ${year}-${monthStr}`,
    ''
  ].join('\n')
}

/**
 * Etapa 7: extrai Timeline Events, faz dedup por date+type+source e
 * escreve em {timelineDir}/{year}/{year}-{month}.md.
 */
export async function runStepEvents(params: StepEventsParams): Promise<StepEventsResult> {
  await ensureDir(params.timelineDir)

  const { content, usage } = await callWithCache(
    params.ctx,
    params.client,
    STANDARD_EVENTS_SYSTEM_PROMPT,
    [STANDARD_EVENTS_USER_PROMPT, params.artifactLanguageInstruction].filter(Boolean).join("\n\n"),
    params.timeoutMs ?? 120_000,
    8192
  )

  let events: EventExtraction[] = []
  try {
    events = JSON.parse(extractJsonArray(content)) as EventExtraction[]
    if (!Array.isArray(events)) events = []
  } catch {
    try {
      events = JSON.parse(repairTruncatedJsonArray(extractJsonArray(content))) as EventExtraction[]
      if (!Array.isArray(events)) events = []
      console.log(`  [step-events] JSON reparado: ${events.length} events.`)
    } catch {
      console.warn('  [step-events] Falha ao parsear JSON de events.')
      events = []
    }
  }

  const eventsPaths: string[] = []
  const created: string[] = []

  for (const event of events) {
    if (!event.date) continue

    const parsed = new Date(event.date)
    if (isNaN(parsed.getTime())) continue

    const year = parsed.getUTCFullYear()
    const month = parsed.getUTCMonth() + 1
    const monthStr = String(month).padStart(2, '0')

    const yearDir = path.join(params.timelineDir, String(year))
    await ensureDir(yearDir)

    const filePath = path.join(yearDir, `${year}-${monthStr}.md`)

    // Garante que o arquivo existe com header
    let fileExists = false
    try {
      await readFile(filePath, 'utf8')
      fileExists = true
    } catch {
      const header = buildTimelineHeader(year, month)
      await writeFile(filePath, header, 'utf8')
      created.push(filePath)
    }

    await upsertTimelineEvent(filePath, event)

    if (!eventsPaths.includes(filePath)) {
      eventsPaths.push(filePath)
    }
  }

  return { created, eventsPaths, usage }
}
