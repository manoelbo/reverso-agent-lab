import path from 'node:path'
import { listMarkdownFiles, listPdfFiles, readUtf8 } from './filesystem'
import type { ReversoPaths } from './config'

interface SourceCheckpointEntry {
  docId: string
  originalFileName: string
  status?: string
  lastError?: string
}

interface SourceCheckpoint {
  files?: SourceCheckpointEntry[]
}

export interface SourceFileInfo {
  docId: string
  fileName: string
  error?: string
}

export interface SystemState {
  sourceEmpty: boolean
  unprocessedFiles: SourceFileInfo[]
  processedFiles: SourceFileInfo[]
  failedFiles: SourceFileInfo[]
  totalSourceFiles: number
  hasAgentContext: boolean
  hasPreviewsWithoutInit: boolean
  isFirstVisit: boolean
  leadsCount: number
}

function deriveCheckpointDocId(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').toLowerCase()
}

async function readSourceCheckpoint(paths: ReversoPaths): Promise<SourceCheckpoint | undefined> {
  const checkpointRaw = await readUtf8(path.join(paths.sourceDir, 'source-checkpoint.json'))
  if (!checkpointRaw) return undefined
  try {
    return JSON.parse(checkpointRaw) as SourceCheckpoint
  } catch {
    return undefined
  }
}

async function countChatMessages(paths: ReversoPaths): Promise<number> {
  const sessionPath = path.join(paths.filesystemRoot, 'sessions', 'sdk-chat', 'default.json')
  const raw = await readUtf8(sessionPath)
  if (!raw) return 0
  try {
    const parsed = JSON.parse(raw) as { messages?: unknown[] }
    return Array.isArray(parsed.messages) ? parsed.messages.length : 0
  } catch {
    return 0
  }
}

export async function detectSystemState(paths: ReversoPaths): Promise<SystemState> {
  const pdfFiles = await listPdfFiles(paths.sourceDir)
  const checkpoint = await readSourceCheckpoint(paths)
  const checkpointByName = new Map<string, SourceCheckpointEntry>()

  for (const entry of checkpoint?.files ?? []) {
    checkpointByName.set(entry.originalFileName, entry)
  }

  const processedFiles: SourceFileInfo[] = []
  const unprocessedFiles: SourceFileInfo[] = []
  const failedFiles: SourceFileInfo[] = []

  for (const fileName of pdfFiles) {
    const fromCheckpoint = checkpointByName.get(fileName)
    const docId = fromCheckpoint?.docId ?? deriveCheckpointDocId(fileName)
    const status = fromCheckpoint?.status ?? 'not_processed'

    if (status === 'done') {
      processedFiles.push({ docId, fileName })
      continue
    }

    if (status === 'failed') {
      failedFiles.push({
        docId,
        fileName,
        ...(fromCheckpoint?.lastError ? { error: fromCheckpoint.lastError } : {}),
      })
      continue
    }

    unprocessedFiles.push({ docId, fileName })
  }

  const hasAgentContext = Boolean(await readUtf8(path.join(paths.outputDir, 'agent.md')))
  const chatMessageCount = await countChatMessages(paths)
  const leadsCount = (await listMarkdownFiles(paths.leadsDir)).length

  return {
    sourceEmpty: pdfFiles.length === 0,
    unprocessedFiles,
    processedFiles,
    failedFiles,
    totalSourceFiles: pdfFiles.length,
    hasAgentContext,
    hasPreviewsWithoutInit: processedFiles.length > 0 && !hasAgentContext,
    isFirstVisit: !hasAgentContext && chatMessageCount === 0,
    leadsCount,
  }
}
