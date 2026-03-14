import path from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { writeJsonAtomic } from './fs-io.js'
import type { StructuredExecutionPlan, StopReason } from './orchestration.js'

const CHECKPOINT_VERSION = 1

export interface InvestigationCheckpointState {
  leadSlug: string
  stage: 'planning' | 'post_tools' | 'pre_persist' | 'post_persist'
  repairedPlan?: StructuredExecutionPlan
  loopProgress?: {
    stopReason: StopReason
    steps: number
    toolCalls: number
    confidence: number
  }
  gate?: {
    approved: boolean
    mode: 'approved' | 'blocked' | 'bypassed'
    reason: string
  }
  reviewQueueIds?: string[]
  repairState?: {
    needsRepair: boolean
    reasons: string[]
  }
}

interface InvestigationCheckpointV1 {
  version: 1
  savedAt: string
  state: InvestigationCheckpointState
}

export function getInvestigationCheckpointPath(investigationDir: string, leadSlug: string): string {
  return path.join(investigationDir, 'checkpoints', `inquiry-${leadSlug}.checkpoint.json`)
}

export async function saveInvestigationCheckpoint(
  investigationDir: string,
  state: InvestigationCheckpointState
): Promise<string> {
  const targetPath = getInvestigationCheckpointPath(investigationDir, state.leadSlug)
  const payload: InvestigationCheckpointV1 = {
    version: CHECKPOINT_VERSION,
    savedAt: new Date().toISOString(),
    state
  }
  await writeJsonAtomic(targetPath, payload)
  return targetPath
}

export async function loadInvestigationCheckpoint(
  investigationDir: string,
  leadSlug: string
): Promise<InvestigationCheckpointState | undefined> {
  const targetPath = getInvestigationCheckpointPath(investigationDir, leadSlug)
  try {
    const raw = await readFile(targetPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<InvestigationCheckpointV1> & {
      state?: Partial<InvestigationCheckpointState>
    }
    if (parsed.version === 1 && parsed.state && typeof parsed.state.leadSlug === 'string') {
      return normalizeState(parsed.state)
    }
    if (parsed.state && typeof parsed.state.leadSlug === 'string') {
      return normalizeState(parsed.state)
    }
    return undefined
  } catch {
    return undefined
  }
}

export async function restoreInvestigationCheckpoint(
  investigationDir: string,
  leadSlug: string
): Promise<InvestigationCheckpointState | undefined> {
  return loadInvestigationCheckpoint(investigationDir, leadSlug)
}

export async function clearInvestigationCheckpoint(
  investigationDir: string,
  leadSlug: string
): Promise<void> {
  const targetPath = getInvestigationCheckpointPath(investigationDir, leadSlug)
  await rm(targetPath, { force: true })
}

function normalizeState(value: Partial<InvestigationCheckpointState>): InvestigationCheckpointState {
  return {
    leadSlug: String(value.leadSlug ?? '').trim(),
    stage: normalizeStage(value.stage),
    ...(value.repairedPlan ? { repairedPlan: value.repairedPlan } : {}),
    ...(value.loopProgress ? { loopProgress: value.loopProgress } : {}),
    ...(value.gate ? { gate: value.gate } : {}),
    ...(Array.isArray(value.reviewQueueIds) ? { reviewQueueIds: value.reviewQueueIds } : {}),
    ...(value.repairState ? { repairState: value.repairState } : {})
  }
}

function normalizeStage(value: unknown): InvestigationCheckpointState['stage'] {
  if (value === 'planning' || value === 'post_tools' || value === 'pre_persist' || value === 'post_persist') {
    return value
  }
  return 'planning'
}
