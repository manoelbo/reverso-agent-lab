import type { IntentDecision } from './router'
import type { SystemState } from '@/lib/source-state'
import type { DeepDiveSession } from '@/lib/session-store'

const intentsThatNeedProcessedData = new Set<IntentDecision['intent']>([
  'deep_dive',
  'deep_dive_next',
  'create_lead',
  'run_inquiry',
  'quick_research',
  'view_data',
  'init',
])

export interface WorkflowGuidance {
  preflight: string[]
  shouldPrioritizeDeepDiveSession: boolean
}

export function buildWorkflowGuidance(input: {
  intent: IntentDecision
  state: SystemState
  session: DeepDiveSession | undefined
}): WorkflowGuidance {
  const preflight: string[] = []
  const needsData = intentsThatNeedProcessedData.has(input.intent.intent)

  if (input.session?.stage === 'awaiting_plan_decision' || input.session?.stage === 'awaiting_inquiry_execution') {
    preflight.push(
      'Há sessão deep-dive ativa. Priorize continuidade com deepDiveNext antes de abrir novo fluxo.'
    )
  }

  if (input.state.sourceEmpty && needsData) {
    preflight.push(
      'A base de fontes está vazia. Oriente upload de PDFs (chat ou sidebar) antes de qualquer investigação.'
    )
  }

  if (input.state.unprocessedFiles.length > 0 && needsData) {
    preflight.push(
      'Existem PDFs pendentes. Enfileire processamento (processSources) antes do pedido principal.'
    )
  }

  if (input.state.hasPreviewsWithoutInit && input.intent.intent !== 'init') {
    preflight.push(
      'Existem previews sem agent.md. Execute initContext antes de continuar o pedido principal.'
    )
  }

  if (preflight.length === 0) {
    preflight.push('Sem bloqueios de pré-fluxo. Pode seguir com a intenção principal.')
  }

  return {
    preflight,
    shouldPrioritizeDeepDiveSession:
      input.session?.stage === 'awaiting_plan_decision' ||
      input.session?.stage === 'awaiting_inquiry_execution',
  }
}
