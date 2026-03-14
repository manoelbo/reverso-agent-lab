import { readFile, writeFile } from 'node:fs/promises'
import type { EventExtraction } from '../../../../core/contracts.js'

export interface EventDedupResult {
  action: 'merged' | 'appended'
}

function normalizeEventKey(date: string, eventType: string, source: string): string {
  return `${date}|${eventType.toLowerCase()}|${source.toLowerCase()}`
}

function extractEventBlocks(content: string): Array<{ block: string; date: string; type: string; source: string }> {
  const blocks: Array<{ block: string; date: string; type: string; source: string }> = []
  const regex = /:::event\n([\s\S]*?):::/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const blockContent = match[1] ?? ''
    const dateMatch = blockContent.match(/^date:\s*(.+)$/m)
    const typeMatch = blockContent.match(/^type:\s*(.+)$/m)
    const sourceMatch = blockContent.match(/^source:\s*(.+)$/m)
    blocks.push({
      block: match[0],
      date: dateMatch?.[1]?.trim() ?? '',
      type: typeMatch?.[1]?.trim() ?? '',
      source: sourceMatch?.[1]?.trim() ?? ''
    })
  }
  return blocks
}

function buildEventBlock(extraction: EventExtraction): string {
  const actorsLine = extraction.actors
    .map((a) => (a.startsWith('[[') ? a : `[[${a}]]`))
    .join(', ')

  const lines = [
    ':::event',
    `date: ${extraction.date}`,
    `actors: ${actorsLine}`,
    `type: ${extraction.event_type}`,
    `source: ${extraction.source}`,
    `page: ${extraction.page}`,
    ...(extraction.follows ? [`follows: ${extraction.follows}`] : []),
    '---',
    extraction.description,
    ':::'
  ]
  return lines.join('\n')
}

function updateEventsCount(content: string): string {
  const count = (content.match(/:::event/g) ?? []).length
  if (/events_count:\s*\d+/.test(content)) {
    return content.replace(/events_count:\s*\d+/, `events_count: ${count}`)
  }
  return content
}

/**
 * Adiciona ou faz merge de um evento em arquivo de timeline mensal.
 * Dedup por date + event_type + source.
 * Se duplicado: complementa actors e description.
 * Se novo: insere na posicao cronologica correta.
 */
export async function upsertTimelineEvent(
  filePath: string,
  extraction: EventExtraction
): Promise<EventDedupResult> {
  let content = await readFile(filePath, 'utf8')
  const existingBlocks = extractEventBlocks(content)

  const newKey = normalizeEventKey(extraction.date, extraction.event_type, extraction.source)
  const duplicate = existingBlocks.find(
    (b) => normalizeEventKey(b.date, b.type, b.source) === newKey
  )

  if (duplicate) {
    // Merge: complementar actors na linha de actors existente
    const existingActorsMatch = duplicate.block.match(/^actors:\s*(.+)$/m)
    if (existingActorsMatch) {
      const existingActorsStr = existingActorsMatch[1] ?? ''
      const existingActors = existingActorsStr.split(',').map((a) => a.trim())
      const newActors = extraction.actors
        .map((a) => (a.startsWith('[[') ? a : `[[${a}]]`))
        .filter((a) => !existingActors.includes(a))
      if (newActors.length > 0) {
        const merged = [...existingActors, ...newActors].join(', ')
        const updatedBlock = duplicate.block.replace(
          /^actors:\s*.+$/m,
          `actors: ${merged}`
        )
        content = content.replace(duplicate.block, updatedBlock)
      }
    }
    content = updateEventsCount(content)
    await writeFile(filePath, content, 'utf8')
    return { action: 'merged' }
  }

  // Novo evento: inserir em posicao cronologica
  const newBlock = buildEventBlock(extraction)

  // Encontra o ultimo evento com data <= nova data
  let insertAfterBlock: string | null = null
  for (const block of existingBlocks) {
    if (block.date <= extraction.date) {
      insertAfterBlock = block.block
    }
  }

  if (insertAfterBlock) {
    content = content.replace(insertAfterBlock, `${insertAfterBlock}\n\n${newBlock}`)
  } else if (existingBlocks.length > 0 && existingBlocks[0]) {
    // Novo evento e o mais antigo: insere antes do primeiro
    content = content.replace(existingBlocks[0].block, `${newBlock}\n\n${existingBlocks[0].block}`)
  } else {
    // Arquivo sem eventos: adiciona ao final
    content = `${content.trimEnd()}\n\n${newBlock}\n`
  }

  content = updateEventsCount(content)
  await writeFile(filePath, content, 'utf8')
  return { action: 'appended' }
}
