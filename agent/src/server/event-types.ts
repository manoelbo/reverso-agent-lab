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

export type AgentEventType =
  | 'route-decision'
  | 'status'
  | 'text-delta'
  | 'text-done'
  | 'reasoning'
  | 'plan'
  | 'plan-step-update'
  | 'tool-call'
  | 'tool-result'
  | 'approval-request'
  | 'source-reference'
  | 'session-update'
  | 'token-usage'
  | 'step-start'
  | 'step-complete'
  | 'step-error'
  | 'error'
  | 'done'
  // E3: Queue + Abort + Retry
  | 'queue-start'
  | 'queue-step-update'
  | 'queue-abort'
  | 'abort-ack'
  | 'retry'
  // E4: Dynamic Suggestions
  | 'suggestions'
  // E5/E6: Artifact
  | 'artifact'
  // E8/E9: Lead Suggestion
  | 'lead-suggestion'
  // E10: Inquiry Allegations
  | 'allegation'

export interface StatusEvent {
  phase: StreamPhase
  label: string
  detail?: string
}

export interface RouteDecisionEvent {
  intent: string
  route: string
  confidence: number
}

export interface TextDeltaEvent {
  delta: string
  fullText: string
}

export interface TextDoneEvent {
  fullText: string
}

export interface TokenUsageEvent {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
}

export interface DoneEvent {
  messageId: string
}

export interface ErrorEvent {
  message: string
  code?: string
}
