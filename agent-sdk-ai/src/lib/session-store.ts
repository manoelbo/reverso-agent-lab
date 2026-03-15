import path from 'node:path'
import { ensureDir, readUtf8, writeUtf8 } from './filesystem'
import type { ReversoPaths } from './config'

interface ChatSessionPayload {
  id: string
  updatedAt: string
  messages: unknown[]
}

export interface DeepDiveSession {
  sessionId?: string
  stage?: 'awaiting_plan_decision' | 'awaiting_inquiry_execution' | 'completed'
  reportPath?: string
  suggestedLeads?: Array<{
    slug: string
    title: string
    status?: 'draft' | 'planned' | 'rejected'
  }>
  updatedAt?: string
}

function chatSessionPath(paths: ReversoPaths): string {
  return path.join(paths.filesystemRoot, 'sessions', 'sdk-chat', 'default.json')
}

export async function loadChatMessages(paths: ReversoPaths): Promise<unknown[]> {
  const raw = await readUtf8(chatSessionPath(paths))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ChatSessionPayload
    return Array.isArray(parsed.messages) ? parsed.messages : []
  } catch {
    return []
  }
}

export async function saveChatMessages(
  paths: ReversoPaths,
  messages: unknown[]
): Promise<void> {
  const filePath = chatSessionPath(paths)
  await ensureDir(path.dirname(filePath))
  const payload: ChatSessionPayload = {
    id: 'default',
    updatedAt: new Date().toISOString(),
    messages,
  }
  await writeUtf8(filePath, JSON.stringify(payload, null, 2))
}

export async function loadActiveDeepDiveSession(
  paths: ReversoPaths
): Promise<DeepDiveSession | undefined> {
  const activePointerRaw = await readUtf8(
    path.join(paths.filesystemRoot, 'sessions', 'deep-dive', 'active-session.json')
  )

  let sessionPath: string | undefined
  if (activePointerRaw) {
    try {
      const parsed = JSON.parse(activePointerRaw) as { sessionId?: string }
      if (parsed.sessionId) {
        sessionPath = path.join(
          paths.filesystemRoot,
          'sessions',
          'deep-dive',
          `${parsed.sessionId}.json`
        )
      }
    } catch {
      // ignora
    }
  }

  const legacyPath = path.join(paths.filesystemRoot, 'deep-dive-session.json')
  const raw = await readUtf8(sessionPath ?? legacyPath)
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as DeepDiveSession
  } catch {
    return undefined
  }
}
