import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { DeepDiveSessionState } from './deep-dive-session.js'
import type { LabPaths } from './paths.js'
import { writeJsonAtomic } from './fs-io.js'

export interface DeepDiveSessionRecord extends DeepDiveSessionState {
  sessionId: string
}

interface ActiveSessionPointer {
  sessionId: string
  updatedAt: string
}

function sessionsDir(paths: LabPaths): string {
  return path.join(paths.filesystemDir, 'sessions', 'deep-dive')
}

function activePointerPath(paths: LabPaths): string {
  return path.join(sessionsDir(paths), 'active-session.json')
}

function sessionFilePath(paths: LabPaths, sessionId: string): string {
  return path.join(sessionsDir(paths), `${sessionId}.json`)
}

function legacySessionPath(paths: LabPaths): string {
  return path.join(paths.filesystemDir, 'deep-dive-session.json')
}

function normalizeSessionId(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!normalized) {
    throw new Error('sessionId invalido para deep-dive session store.')
  }
  return normalized
}

function parseSession(value: unknown): DeepDiveSessionState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<DeepDiveSessionState>
  if (
    candidate.stage !== 'awaiting_plan_decision' &&
    candidate.stage !== 'awaiting_inquiry_execution' &&
    candidate.stage !== 'completed'
  ) {
    return undefined
  }
  if (typeof candidate.reportPath !== 'string' || !Array.isArray(candidate.suggestedLeads)) {
    return undefined
  }
  if (typeof candidate.createdAt !== 'string' || typeof candidate.updatedAt !== 'string') {
    return undefined
  }
  return candidate as DeepDiveSessionState
}

function hydrateSessionRecord(sessionId: string, state: DeepDiveSessionState): DeepDiveSessionRecord {
  return {
    ...state,
    sessionId
  }
}

export async function createSession(
  paths: LabPaths,
  input: DeepDiveSessionState,
  preferredSessionId?: string
): Promise<DeepDiveSessionRecord> {
  const sessionId = normalizeSessionId(
    preferredSessionId ??
      `deep-dive-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )
  const session = hydrateSessionRecord(sessionId, input)
  await saveSession(paths, session)
  await setActiveSession(paths, sessionId)
  return session
}

export async function loadSession(
  paths: LabPaths,
  sessionId: string
): Promise<DeepDiveSessionRecord | undefined> {
  const normalizedId = normalizeSessionId(sessionId)
  const targetPath = sessionFilePath(paths, normalizedId)
  try {
    const raw = await readFile(targetPath, 'utf8')
    const parsed = parseSession(JSON.parse(raw))
    if (!parsed) return undefined
    return hydrateSessionRecord(normalizedId, parsed)
  } catch {
    return undefined
  }
}

export async function saveSession(paths: LabPaths, session: DeepDiveSessionRecord): Promise<string> {
  const sessionId = normalizeSessionId(session.sessionId)
  const targetPath = sessionFilePath(paths, sessionId)
  await writeJsonAtomic(targetPath, {
    stage: session.stage,
    reportPath: session.reportPath,
    suggestedLeads: session.suggestedLeads,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  } satisfies DeepDiveSessionState)
  return targetPath
}

export async function setActiveSession(paths: LabPaths, sessionId: string): Promise<string> {
  const pointer: ActiveSessionPointer = {
    sessionId: normalizeSessionId(sessionId),
    updatedAt: new Date().toISOString()
  }
  const targetPath = activePointerPath(paths)
  await writeJsonAtomic(targetPath, pointer)
  return targetPath
}

export async function loadActiveSession(paths: LabPaths): Promise<DeepDiveSessionRecord | undefined> {
  try {
    const raw = await readFile(activePointerPath(paths), 'utf8')
    const parsed = JSON.parse(raw) as Partial<ActiveSessionPointer>
    if (!parsed || typeof parsed.sessionId !== 'string' || parsed.sessionId.trim().length === 0) {
      return loadLegacySession(paths)
    }
    const active = await loadSession(paths, parsed.sessionId)
    if (active) return active
    return loadLegacySession(paths)
  } catch {
    return loadLegacySession(paths)
  }
}

export async function loadLegacySession(paths: LabPaths): Promise<DeepDiveSessionRecord | undefined> {
  try {
    const raw = await readFile(legacySessionPath(paths), 'utf8')
    const parsed = parseSession(JSON.parse(raw))
    if (!parsed) return undefined
    return hydrateSessionRecord('legacy', parsed)
  } catch {
    return undefined
  }
}
