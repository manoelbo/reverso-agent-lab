import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { TimelineEvent } from '../../core/contracts.js'
import { ensureDir, writeUtf8 } from '../../core/fs-io.js'
import { formatFrontmatter } from '../../core/markdown.js'
import type { ToolContext } from './context.js'

export interface CreateTimelineEventInput {
  date: string
  actors: string[]
  eventType: string
  source: string
  description: string
  follows?: string
  tags?: string[]
}

export interface CreateTimelineEventOutput {
  timelinePath: string
  event: TimelineEvent
}

function toWikiLink(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('[[') ? trimmed : `[[${trimmed}]]`
}

function buildTimelineHeader(year: number, month: number, tags: string[]): string {
  const monthTitle = `${year}-${String(month).padStart(2, '0')}`
  return [
    formatFrontmatter({
      type: 'timeline',
      year,
      month,
      events_count: 0,
      tags
    }),
    '',
    `# ${monthTitle}`,
    ''
  ].join('\n')
}

function buildEventBlock(input: CreateTimelineEventInput): string {
  const actorsLine = input.actors.map(toWikiLink).filter(Boolean).join(', ')
  return [
    ':::event',
    `date: ${input.date}`,
    `actors: ${actorsLine}`,
    `type: ${input.eventType}`,
    `source: ${input.source}`,
    input.follows ? `follows: ${input.follows}` : '',
    '---',
    input.description,
    ':::',
    ''
  ]
    .filter((line) => line !== '')
    .join('\n')
}

function updateEventsCount(content: string): string {
  const count = (content.match(/:::event/g) ?? []).length
  if (/events_count:\s*\d+/.test(content)) {
    return content.replace(/events_count:\s*\d+/, `events_count: ${count}`)
  }
  return content
}

export async function createTimelineEvent(
  input: CreateTimelineEventInput,
  ctx: ToolContext
): Promise<CreateTimelineEventOutput> {
  const parsedDate = new Date(input.date)
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error(`Data invalida para timeline: ${input.date}`)
  }
  const year = parsedDate.getUTCFullYear()
  const month = parsedDate.getUTCMonth() + 1
  const monthDir = path.join(ctx.paths.dossierTimelineDir, String(year))
  const timelinePath = path.join(monthDir, `${year}-${String(month).padStart(2, '0')}.md`)

  await ensureDir(monthDir)
  const tags = [...new Set((input.tags ?? []).map((tag) => tag.trim()).filter(Boolean))]

  let current = ''
  try {
    current = await readFile(timelinePath, 'utf8')
  } catch {
    current = buildTimelineHeader(year, month, tags)
  }

  const eventBlock = buildEventBlock(input)
  const updated = updateEventsCount(`${current}\n${eventBlock}`.trimEnd() + '\n')
  await writeUtf8(timelinePath, updated)

  const event: TimelineEvent = {
    date: input.date,
    actors: input.actors,
    eventType: input.eventType,
    source: input.source,
    description: input.description,
    ...(input.follows ? { follows: input.follows } : {})
  }
  return { timelinePath, event }
}

