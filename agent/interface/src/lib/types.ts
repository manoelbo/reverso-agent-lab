export type StreamPhase =
  | 'routing'
  | 'streaming-llm'
  | 'executing-tool'
  | 'awaiting-approval'
  | 'processing'
  | 'idle'

export type ToolLifecycle =
  | 'requested'
  | 'running'
  | 'success'
  | 'error'
  | 'rejected'

export interface PlanStep {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface QueueStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'aborted'
}

export type MessagePartType =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | {
      type: 'tool-call'
      toolId: string
      toolName: string
      input: unknown
      lifecycle: ToolLifecycle
      output?: unknown
      error?: string
    }
  | { type: 'plan'; planId: string; title: string; steps: PlanStep[] }
  | { type: 'source-reference'; docId: string; page?: number; role?: 'consulted' | 'created'; docName?: string }
  | {
      type: 'confirmation'
      requestId: string
      title: string
      description?: string
      state: 'approval-requested' | 'approved' | 'rejected'
    }
  // E3: Queue + Retry
  | {
      type: 'queue'
      queueId: string
      steps: QueueStep[]
      currentStep: number
      aborted?: boolean
    }
  | {
      type: 'retry'
      attempt: number
      maxAttempts: number
      delaySec: number
      errorSnippet: string
    }
  // E4: Dynamic Suggestions
  | { type: 'suggestions'; items: Array<{ id: string; text: string }> }
  // E5/E6: Artifact (arquivo gerado para exibição)
  | { type: 'artifact'; title: string; content: string; language?: string; path?: string }
  // E8/E9: Lead Suggestion
  | {
      type: 'lead-suggestion'
      leadId: string
      slug: string
      title: string
      description: string
      inquiryPlan?: string
      status?: 'draft' | 'planned' | 'rejected'
      actionState?: 'pending' | 'accepted' | 'rejected'
    }
  // E10: Inquiry Allegations
  | {
      type: 'allegation'
      id: string
      title: string
      leadSlug: string
      status: 'pending' | 'accepted' | 'rejected'
      findings: Array<{
        id: string
        text: string
        status: 'unverified' | 'verified' | 'rejected'
        sourceRefs?: string[]
      }>
    }

export interface TraceStep {
  id: string
  type: 'routing' | 'tool' | 'step'
  label: string
  description?: string
  status: 'active' | 'complete' | 'error'
  startedAt: number
  endedAt?: number
}

export interface ChatAttachment {
  id: string
  name: string
  mediaType: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  parts: MessagePartType[]
  attachments?: ChatAttachment[]
  routeDecision?: { intent: string; route: string; reason?: string }
  traceSteps?: TraceStep[]
  timestamp: string
}

export interface StreamState {
  phase: StreamPhase
  error?: { message: string; code?: string }
}

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export interface AgentEvent {
  type: string
  data: Record<string, unknown>
}

export interface AgentSessionContext {
  model: string
  sessionStage: string | null
  leadsCount: number
  // System state fields (E1)
  sourceEmpty: boolean
  unprocessedCount: number
  processedCount: number
  failedCount: number
  hasAgentContext: boolean
  isFirstVisit: boolean
  hasPreviewsWithoutInit: boolean
  lastSessionTimestamp: string | null
  testMode: boolean
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
}
