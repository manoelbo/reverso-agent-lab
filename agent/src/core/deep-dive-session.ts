import type { LabPaths } from './paths.js'
import {
  createSession,
  loadActiveSession,
  saveSession,
  setActiveSession
} from './deep-dive-session-store.js'

export type DeepDiveStage =
  | 'awaiting_plan_decision'
  | 'awaiting_inquiry_execution'
  | 'completed'

export interface SuggestedLeadState {
  slug: string
  title: string
  description: string
  status: 'draft' | 'planned'
  createdInLastRun: boolean
  duplicateReason?: 'exact_match' | 'semantic_similarity'
}

export interface DeepDiveSessionState {
  sessionId?: string
  stage: DeepDiveStage
  reportPath: string
  suggestedLeads: SuggestedLeadState[]
  createdAt: string
  updatedAt: string
}

export async function loadDeepDiveSession(paths: LabPaths): Promise<DeepDiveSessionState | undefined> {
  const session = await loadActiveSession(paths)
  return session
}

export async function saveDeepDiveSession(paths: LabPaths, state: DeepDiveSessionState): Promise<string> {
  const existingSessionId = typeof state.sessionId === 'string' ? state.sessionId : undefined
  if (existingSessionId) {
    const savedPath = await saveSession(paths, {
      ...state,
      sessionId: existingSessionId
    })
    await setActiveSession(paths, existingSessionId)
    return savedPath
  }

  const created = await createSession(paths, state)
  return `session:${created.sessionId}`
}

