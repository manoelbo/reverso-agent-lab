import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { InputDocument } from './contracts.js'

/** Heuristica rapida: ~4 chars por token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface PreviewItem {
  docId: string
  documentName: string
  content: string
  absolutePath: string
}

export interface RandomPreviewsResult {
  previews: PreviewItem[]
  candidatesCount: number
  usedCount: number
  estimatedTokens: number
}

/** Le checkpoint global da source e retorna mapa docId -> originalFileName. */
export async function readSourceCheckpoint(sourceDir: string): Promise<Map<string, string>> {
  const checkpointPath = path.join(sourceDir, 'source-checkpoint.json')
  try {
    const raw = await readFile(checkpointPath, 'utf8')
    const data = JSON.parse(raw) as { files?: Array<{ docId?: string; originalFileName?: string }> }
    const map = new Map<string, string>()
    for (const f of data.files ?? []) {
      if (f.docId && f.originalFileName) map.set(f.docId, f.originalFileName)
    }
    return map
  } catch {
    return new Map()
  }
}

/** Lista candidatos com preview.md em sourceArtifactsDir; documentName vem do checkpoint ou docId. */
export async function listPreviewCandidates(
  sourceArtifactsDir: string,
  docIdToName: Map<string, string>
): Promise<Array<{ docId: string; documentName: string; previewPath: string }>> {
  const candidates: Array<{ docId: string; documentName: string; previewPath: string }> = []
  let entries: string[]
  try {
    entries = await readdir(sourceArtifactsDir)
  } catch {
    return []
  }
  for (const name of entries) {
    const previewPath = path.join(sourceArtifactsDir, name, 'preview.md')
    try {
      await readFile(previewPath, 'utf8')
    } catch {
      continue
    }
    const documentName = docIdToName.get(name) ?? name
    candidates.push({ docId: name, documentName, previewPath })
  }
  return candidates
}

/** Embaralha e carrega previews ate atingir maxTokens (orçamento global). */
export async function loadRandomPreviewsWithinBudget(
  sourceArtifactsDir: string,
  sourceDir: string,
  maxTokens: number
): Promise<RandomPreviewsResult> {
  const docIdToName = await readSourceCheckpoint(sourceDir)
  const candidates = await listPreviewCandidates(sourceArtifactsDir, docIdToName)
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const previews: PreviewItem[] = []
  let estimatedTokens = 0
  for (const c of shuffled) {
    if (estimatedTokens >= maxTokens) break
    const content = await readFile(c.previewPath, 'utf8')
    const tokens = estimateTokens(content)
    if (estimatedTokens + tokens > maxTokens && previews.length > 0) break
    previews.push({
      docId: c.docId,
      documentName: c.documentName,
      content,
      absolutePath: c.previewPath
    })
    estimatedTokens += tokens
  }
  return {
    previews,
    candidatesCount: candidates.length,
    usedCount: previews.length,
    estimatedTokens
  }
}

/** Retorna lista de previews em ordem aleatória (sem orçamento de tokens). */
export async function loadPreviewsIncremental(
  sourceArtifactsDir: string,
  sourceDir: string
): Promise<{ previews: PreviewItem[] }> {
  const docIdToName = await readSourceCheckpoint(sourceDir)
  const candidates = await listPreviewCandidates(sourceArtifactsDir, docIdToName)
  const shuffled = [...candidates].sort(() => Math.random() - 0.5)
  const previews: PreviewItem[] = []
  for (const c of shuffled) {
    const content = await readFile(c.previewPath, 'utf8')
    previews.push({
      docId: c.docId,
      documentName: c.documentName,
      content,
      absolutePath: c.previewPath
    })
  }
  return { previews }
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readMarkdownExamples(inputDir: string): Promise<InputDocument[]> {
  const entries = await readdir(inputDir, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))

  const docs: InputDocument[] = []
  for (const fileName of files) {
    const absolutePath = path.join(inputDir, fileName)
    const content = await readFile(absolutePath, 'utf8')
    docs.push({
      id: slugify(path.basename(fileName, '.md')),
      fileName,
      absolutePath,
      content
    })
  }
  return docs
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await writeUtf8Atomic(filePath, content)
}

export async function writeUtf8Atomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  )
  await writeFile(tempPath, content, 'utf8')
  try {
    await rename(tempPath, filePath)
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    throw error
  }
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await writeUtf8Atomic(filePath, JSON.stringify(value, null, 2))
}

export function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[...conteudo truncado para caber no contexto...]`
}

