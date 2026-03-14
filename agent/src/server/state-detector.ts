import path from 'node:path'
import { access } from 'node:fs/promises'
import type { RuntimeConfig } from '../config/env.js'
import { loadSourceCheckpoint } from '../tools/document-processing/source-checkpoint.js'
import { scanSourceFiles } from '../tools/document-processing/source-indexer.js'
import { loadChatSession, DEFAULT_SESSION_ID } from './chat-session.js'
import { loadActiveSession } from '../core/deep-dive-session-store.js'
import { listLeadSummaries, type LeadSummary } from '../runner/run-agent.js'

export interface FileInfo {
  docId: string
  fileName: string
  error?: string
}

export interface SystemState {
  sourceEmpty: boolean
  unprocessedFiles: FileInfo[]
  processedFiles: FileInfo[]
  failedFiles: FileInfo[]
  totalSourceFiles: number
  hasAgentContext: boolean
  isFirstVisit: boolean
  hasDeepDiveSession: boolean
  sessionStage?: string
  leads: LeadSummary[]
  hasPreviewsWithoutInit: boolean
  lastSessionTimestamp?: string
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function detectSystemState(runtime: RuntimeConfig): Promise<SystemState> {
  // 1. Scan physical files in source directory
  let scannedFiles: Awaited<ReturnType<typeof scanSourceFiles>> = []
  try {
    scannedFiles = await scanSourceFiles(runtime.paths.sourceDir)
  } catch {
    // sourceDir may not exist yet — treat as empty
  }

  // 2. Load checkpoint for status tracking
  const checkpoint = await loadSourceCheckpoint(runtime.paths.sourceDir)
  const checkpointByDocId = new Map((checkpoint?.files ?? []).map((f) => [f.docId, f]))

  // 3. Cross-reference physical files with checkpoint statuses
  const unprocessedFiles: FileInfo[] = []
  const processedFiles: FileInfo[] = []
  const failedFiles: FileInfo[] = []

  for (const scanned of scannedFiles) {
    const entry = checkpointByDocId.get(scanned.docId)
    const status = entry?.status ?? 'not_processed'
    if (status === 'done') {
      processedFiles.push({ docId: scanned.docId, fileName: scanned.originalFileName })
    } else if (status === 'failed') {
      failedFiles.push({
        docId: scanned.docId,
        fileName: scanned.originalFileName,
        ...(entry?.lastError ? { error: entry.lastError } : {}),
      })
    } else {
      // not_processed, replica_running, preview_metadata_running
      unprocessedFiles.push({ docId: scanned.docId, fileName: scanned.originalFileName })
    }
  }

  // 4. Agent context (agent.md)
  const hasAgentContext = await fileExists(path.join(runtime.paths.outputDir, 'agent.md'))

  // 5. Chat session history
  const chatSession = await loadChatSession(DEFAULT_SESSION_ID)
  const hasChatHistory = chatSession.messages.length > 0
  const lastSessionTimestamp = hasChatHistory ? chatSession.updatedAt : undefined

  // 6. Deep-dive session
  const sessionRecord = await loadActiveSession(runtime.paths)
  const hasDeepDiveSession = Boolean(
    sessionRecord &&
      (sessionRecord.stage === 'awaiting_plan_decision' ||
        sessionRecord.stage === 'awaiting_inquiry_execution'),
  )
  const sessionStage = hasDeepDiveSession ? sessionRecord?.stage : undefined

  // 7. Leads
  const leads = await listLeadSummaries(runtime.paths.leadsDir)

  const totalSourceFiles = scannedFiles.length
  const sourceEmpty = totalSourceFiles === 0
  const isFirstVisit = !hasAgentContext && !hasChatHistory
  const hasPreviewsWithoutInit = processedFiles.length > 0 && !hasAgentContext

  return {
    sourceEmpty,
    unprocessedFiles,
    processedFiles,
    failedFiles,
    totalSourceFiles,
    hasAgentContext,
    isFirstVisit,
    hasDeepDiveSession,
    ...(sessionStage ? { sessionStage } : {}),
    leads,
    hasPreviewsWithoutInit,
    ...(lastSessionTimestamp ? { lastSessionTimestamp } : {}),
  }
}
