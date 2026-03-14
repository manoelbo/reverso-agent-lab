export interface LoopUsage {
  steps: number
  toolCalls: number
  elapsedMs: number
  estimatedTokens: number
}

export interface LoopBudget {
  maxSteps: number
  maxToolCalls: number
  maxElapsedMs: number
  maxTokens?: number
}

export type PlanStepStatus = 'pending' | 'running' | 'done' | 'error'

export interface UiFeedbackController {
  routeDecision(intent: string, reason?: string): void

  textDelta(text: string): void

  reasoning(text: string): void

  stepStart(id: string, label: string, description?: string): void
  stepComplete(id: string, description?: string): void
  stepError(id: string, description?: string): void

  planStart(planId: string, title: string, steps: { id: string; title: string }[]): void
  planStepUpdate(planId: string, stepId: string, status: PlanStepStatus): void

  toolStart(toolId: string, toolName: string, inputSummary?: string): void
  toolSuccess(toolId: string, outputSummary?: string, durationMs?: number): void
  toolError(toolId: string, errorMessage: string, errorCode?: string): void

  fileCreated(path: string, addedLines?: number, preview?: string): void
  fileEdited(path: string, addedLines?: number, removedLines?: number): void
  fileDeleted(path: string): void

  requestApproval(requestId: string, title: string, description?: string): void

  systemInfo(message: string): void
  systemWarn(message: string): void
  systemError(message: string): void

  summary(title: string, lines: string[]): void

  loopProgress(step: number, usage: LoopUsage, budget: LoopBudget): void
  loopVerification(step: number, ok: boolean, confidence: number, reason: string, gaps: string[]): void
  loopStopped(step: number, failures: number, stopReason: string): void

  tokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number }): void

  artifact?(params: { title: string; content: string; language?: string; path?: string }): void

  suggestions?(items: Array<{ id: string; text: string }>): void

  sourceConsulted?(docId: string, docName?: string): void

  queueStart?(queueId: string, steps: Array<{ id: string; label: string }>): void
  queueStepUpdate?(queueId: string, stepId: string, status: 'running' | 'done' | 'error' | 'aborted'): void
  queueAbort?(queueId: string): void

  leadSuggestion?(lead: {
    leadId: string
    slug: string
    title: string
    description: string
    inquiryPlan?: string
    status: 'draft' | 'planned'
  }): void

  allegation?(params: {
    id: string
    title: string
    leadSlug: string
    status: string
    findings: Array<{ id: string; text: string; status: string; sourceRefs?: string[] }>
  }): void

  getFullText(): string
  flush(): Promise<void>
}
