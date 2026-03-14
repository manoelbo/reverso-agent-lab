// @ts-nocheck
import { readFile, writeFile } from 'node:fs/promises'
import type { OcrCheckpoint } from './types.js'

export async function loadCheckpoint(path: string): Promise<OcrCheckpoint | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw) as OcrCheckpoint
    if (!data.pdfPath || !Array.isArray(data.chunks)) return null
    return data
  } catch {
    return null
  }
}

export async function saveCheckpoint(path: string, data: OcrCheckpoint): Promise<void> {
  const next = { ...data, updatedAt: new Date().toISOString() }
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8')
}

export function createInitialCheckpoint(
  pdfPath: string,
  totalPages: number,
  totalChunks: number,
  chunkPages: number,
  chunkRanges: Array<{ startPage: number; endPage: number }>
): OcrCheckpoint {
  const now = new Date().toISOString()
  return {
    pdfPath,
    totalPages,
    totalChunks,
    chunkPages,
    chunks: chunkRanges.map((range, index) => ({
      index,
      startPage: range.startPage,
      endPage: range.endPage,
      status: 'pending' as const
    })),
    startedAt: now,
    updatedAt: now
  }
}
