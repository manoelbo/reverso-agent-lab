import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// __dirname = lab/agent/src/server — two levels up reaches lab/agent/
// Respects AGENT_FILESYSTEM_DIR env var (e.g. filesystem_test) the same way paths.ts does
const filesystemName = process.env['AGENT_FILESYSTEM_DIR'] ?? 'filesystem'
const FILESYSTEM_ROOT = path.resolve(__dirname, `../../${filesystemName}`)
const SESSION_DIR = path.join(FILESYSTEM_ROOT, 'sessions', 'chat')

export const DEFAULT_SESSION_ID = 'default'

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface PersistedSession {
  id: string
  createdAt: string
  updatedAt: string
  messages: PersistedMessage[]
}

function sessionPath(id: string): string {
  return path.join(SESSION_DIR, `${id}.json`)
}

export async function loadChatSession(id: string): Promise<PersistedSession> {
  try {
    const raw = await fs.readFile(sessionPath(id), 'utf-8')
    return JSON.parse(raw) as PersistedSession
  } catch {
    return {
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    }
  }
}

export async function appendChatTurn(
  id: string,
  userMsg: PersistedMessage,
  assistantMsg: PersistedMessage,
): Promise<void> {
  await fs.mkdir(SESSION_DIR, { recursive: true })
  const session = await loadChatSession(id)
  session.messages.push(userMsg, assistantMsg)
  session.updatedAt = new Date().toISOString()
  await fs.writeFile(sessionPath(id), JSON.stringify(session, null, 2), 'utf-8')
}
