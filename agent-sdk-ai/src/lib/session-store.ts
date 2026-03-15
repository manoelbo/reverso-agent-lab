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

function resolveDeepDiveSessionTtlMs(): number {
  const value = Number(process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] ?? 72 * 60 * 60 * 1000)
  if (!Number.isFinite(value) || value <= 0) return 72 * 60 * 60 * 1000
  return value
}

function isSessionExpired(session: DeepDiveSession, nowMs = Date.now()): boolean {
  if (!session.updatedAt) return false
  const updatedAt = Date.parse(session.updatedAt)
  if (!Number.isFinite(updatedAt)) return false
  const ttlMs = resolveDeepDiveSessionTtlMs()
  return nowMs - updatedAt > ttlMs
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
    const parsed = JSON.parse(raw) as DeepDiveSession
    if (isSessionExpired(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}
