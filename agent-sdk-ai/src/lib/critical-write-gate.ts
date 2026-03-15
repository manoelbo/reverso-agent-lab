export type CriticalWriteGateMode = 'approved' | 'blocked' | 'bypassed'
export type OrchestrationStopReason =
  | 'goal_reached'
  | 'insufficient_evidence'
  | 'low_confidence'
  | 'error'

export interface CriticalWriteGateDecision {
  approved: boolean
  mode: CriticalWriteGateMode
  reason: string
}

export function resolveCriticalWriteGateDecision(input: {
  gateEnabled: boolean
  requireExplicitWriteApproval: boolean
  hasPersistActionPlanned: boolean
  orchestrationStopReason?: OrchestrationStopReason
}): CriticalWriteGateDecision {
  if (!input.gateEnabled) {
    return {
      approved: true,
      mode: 'bypassed',
      reason: 'critical_write_gate_disabled',
    }
  }

  if (!input.requireExplicitWriteApproval) {
    return {
      approved: true,
      mode: 'approved',
      reason: 'explicit_approval_not_required',
    }
  }

  const approved =
    input.hasPersistActionPlanned &&
    input.orchestrationStopReason === 'goal_reached'

  if (approved) {
    return {
      approved: true,
      mode: 'approved',
      reason: 'persist_action_planned_and_goal_reached',
    }
  }

  return {
    approved: false,
    mode: 'blocked',
    reason: input.hasPersistActionPlanned
      ? `orchestration_stop_reason_${input.orchestrationStopReason ?? 'unknown'}`
      : 'missing_explicit_persist_approval',
  }
}
