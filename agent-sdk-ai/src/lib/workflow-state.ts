import type { IntentDecision } from '@/agent/router'
import { buildQueuePlan } from '@/agent/queue-planner'
import { buildWorkflowGuidance } from '@/agent/workflow-engine'
import type { ReversoPaths } from './config'
import { loadActiveDeepDiveSession } from './session-store'
import { detectSystemState } from './source-state'

export interface WorkflowSnapshot {
  intent: IntentDecision
  guidance: ReturnType<typeof buildWorkflowGuidance>
  queuePlan: ReturnType<typeof buildQueuePlan>
  state: Awaited<ReturnType<typeof detectSystemState>>
  session: Awaited<ReturnType<typeof loadActiveDeepDiveSession>>
}

export async function loadWorkflowSnapshot(input: {
  paths: ReversoPaths
  userText: string
  classifyIntent: (text: string) => Promise<IntentDecision>
}): Promise<WorkflowSnapshot> {
  const [state, session, intent] = await Promise.all([
    detectSystemState(input.paths),
    loadActiveDeepDiveSession(input.paths),
    input.classifyIntent(input.userText || 'mensagem vazia'),
  ])

  const guidance = buildWorkflowGuidance({ intent, state, session })
  const queuePlan = buildQueuePlan({
    preflight: guidance.preflight,
    intent: intent.intent,
  })

  return {
    intent,
    guidance,
    queuePlan,
    state,
    session,
  }
}
