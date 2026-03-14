import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { EvidenceLocation } from './contracts.js'
import type { LabPaths } from './paths.js'

interface SourceIndexItem {
  docId: string
  originalFileName: string
  sourcePath: string
  fileType: string
  artifactDir: string
}

export interface EvidenceLocatorInput {
  paths: LabPaths
  sourceId: string
  excerpt: string
  fallbackPage?: number
}

export interface EvidenceLocatorResult {
  source_id: string
  location: EvidenceLocation
  score: number
  ambiguous: boolean
  matched: boolean
  notes: string[]
}

const textCache = new Map<string, string>()
const checkpointCache = new Map<string, SourceIndexItem[]>()

export async function resolveEvidenceLocation(
  input: EvidenceLocatorInput
): Promise<EvidenceLocatorResult> {
  const notes: string[] = []
  const sourceIndex = await loadSourceIndex(input.paths)
  const source = findSource(sourceIndex, input.sourceId)
  if (!source) {
    return {
      source_id: input.sourceId,
      location: { kind: 'unknown', hint: 'source_not_found' },
      score: 0,
      ambiguous: false,
      matched: false,
      notes: ['Source not found in source-checkpoint.']
    }
  }

  const searchable = await loadSearchableText(source)
  if (!searchable) {
    return {
      source_id: source.docId,
      location: { kind: 'unknown', hint: 'text_not_available' },
      score: 0,
      ambiguous: false,
      matched: false,
      notes: ['No searchable text available for source.']
    }
  }

  const query = normalizeForMatch(input.excerpt)
  if (query.length < 12) {
    notes.push('Excerpt too short; confidence reduced.')
  }
  const { firstIndex, matchCount, exact } = findMatch(searchable.normalized, query)
  if (firstIndex < 0) {
    return {
      source_id: source.docId,
      location: source.fileType === 'pdf'
        ? {
            kind: 'pdf',
            ...(typeof input.fallbackPage === 'number' ? { page: input.fallbackPage } : {})
          }
        : { kind: 'unknown', hint: 'excerpt_not_found' },
      score: 0.3,
      ambiguous: false,
      matched: false,
      notes: [...notes, 'Excerpt not found in source text.']
    }
  }

  const rawIndex = mapNormalizedIndexToRaw(searchable.raw, searchable.normalized, firstIndex)
  const lineStart = computeLine(searchable.raw, rawIndex)
  const lineEnd = computeLine(searchable.raw, rawIndex + input.excerpt.length)
  const ambiguous = matchCount > 1
  if (ambiguous) notes.push('Excerpt appears multiple times in source.')

  if (source.fileType === 'pdf') {
    const page =
      inferPdfPage(searchable.raw, rawIndex) ??
      (typeof input.fallbackPage === 'number' ? input.fallbackPage : undefined)
    return {
      source_id: source.docId,
      location: {
        kind: 'pdf',
        ...(typeof page === 'number' ? { page } : {}),
        ...(typeof rawIndex === 'number' ? { startOffset: rawIndex } : {}),
        ...(typeof rawIndex === 'number' ? { endOffset: rawIndex + input.excerpt.length } : {})
      },
      score: buildScore({ exact, ambiguous, queryLength: query.length }),
      ambiguous,
      matched: true,
      notes
    }
  }

  return {
    source_id: source.docId,
    location: {
      kind: 'text',
      lineStart,
      lineEnd,
      startOffset: rawIndex,
      endOffset: rawIndex + input.excerpt.length
    },
    score: buildScore({ exact, ambiguous, queryLength: query.length }),
    ambiguous,
    matched: true,
    notes
  }
}

async function loadSourceIndex(paths: LabPaths): Promise<SourceIndexItem[]> {
  const checkpointPath = path.join(paths.sourceDir, 'source-checkpoint.json')
  const cached = checkpointCache.get(checkpointPath)
  if (cached) return cached
  try {
    const raw = await readFile(checkpointPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      files?: Array<{
        docId?: string
        originalFileName?: string
        sourcePath?: string
        fileType?: string
        artifactDir?: string
      }>
    }
    const list = (parsed.files ?? [])
      .map((entry) => {
        if (!entry.docId || !entry.originalFileName || !entry.sourcePath || !entry.fileType || !entry.artifactDir) {
          return undefined
        }
        return {
          docId: entry.docId,
          originalFileName: entry.originalFileName,
          sourcePath: entry.sourcePath,
          fileType: entry.fileType,
          artifactDir: entry.artifactDir
        } satisfies SourceIndexItem
      })
      .filter((item): item is SourceIndexItem => Boolean(item))
    checkpointCache.set(checkpointPath, list)
    return list
  } catch {
    return []
  }
}

function findSource(index: SourceIndexItem[], sourceId: string): SourceIndexItem | undefined {
  const key = sourceId.trim().toLowerCase()
  if (!key) return undefined
  return index.find((item) => {
    if (item.docId.toLowerCase() === key) return true
    if (item.originalFileName.toLowerCase() === key) return true
    return path.basename(item.originalFileName).toLowerCase() === key
  })
}

async function loadSearchableText(source: SourceIndexItem): Promise<{ raw: string; normalized: string } | undefined> {
  const cacheKey = `${source.docId}:${source.fileType}`
  const cached = textCache.get(cacheKey)
  if (cached) return { raw: cached, normalized: normalizeForMatch(cached) }
  const candidates =
    source.fileType === 'pdf'
      ? [path.join(source.artifactDir, 'preview.md'), path.join(source.artifactDir, 'index.md')]
      : [source.sourcePath, path.join(source.artifactDir, 'preview.md')]
  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf8')
      textCache.set(cacheKey, raw)
      return { raw, normalized: normalizeForMatch(raw) }
    } catch {
      continue
    }
  }
  return undefined
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function findMatch(haystack: string, needle: string): { firstIndex: number; matchCount: number; exact: boolean } {
  if (!needle) return { firstIndex: -1, matchCount: 0, exact: false }
  const direct = haystack.indexOf(needle)
  if (direct >= 0) {
    return { firstIndex: direct, matchCount: countMatches(haystack, needle), exact: true }
  }
  const shortNeedle = needle.length > 48 ? needle.slice(0, 48) : needle
  const fuzzy = haystack.indexOf(shortNeedle)
  if (fuzzy >= 0) {
    return { firstIndex: fuzzy, matchCount: countMatches(haystack, shortNeedle), exact: false }
  }
  return { firstIndex: -1, matchCount: 0, exact: false }
}

function countMatches(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let cursor = 0
  while (cursor >= 0) {
    const idx = haystack.indexOf(needle, cursor)
    if (idx < 0) break
    count += 1
    cursor = idx + Math.max(1, Math.floor(needle.length / 2))
  }
  return count
}

function mapNormalizedIndexToRaw(raw: string, normalized: string, normalizedIdx: number): number {
  if (normalizedIdx <= 0) return 0
  // Approximate map: proportional mapping from normalized to raw.
  const ratio = normalized.length > 0 ? normalizedIdx / normalized.length : 0
  return Math.min(raw.length - 1, Math.max(0, Math.floor(raw.length * ratio)))
}

function computeLine(text: string, offset: number): number {
  if (offset <= 0) return 1
  let line = 1
  for (let i = 0; i < Math.min(offset, text.length); i += 1) {
    if (text[i] === '\n') line += 1
  }
  return line
}

function inferPdfPage(text: string, offset: number): number | undefined {
  const start = Math.max(0, offset - 1800)
  const end = Math.min(text.length, offset + 200)
  const window = text.slice(start, end)
  const regex = /(p[aá]gina|page)\s+(\d{1,4})/gi
  let matched: number | undefined
  for (const match of window.matchAll(regex)) {
    const page = Number.parseInt(match[2] ?? '', 10)
    if (Number.isFinite(page)) matched = Math.max(1, page)
  }
  return matched
}

function buildScore(input: { exact: boolean; ambiguous: boolean; queryLength: number }): number {
  let score = input.exact ? 0.92 : 0.74
  if (input.ambiguous) score -= 0.18
  if (input.queryLength < 20) score -= 0.12
  return Math.max(0, Math.min(1, score))
}
