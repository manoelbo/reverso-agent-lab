export type AgentStepStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'
export type FileChangeType = 'new' | 'edited' | 'deleted'

export interface AgentStepEvent {
  type: 'agent_step'
  label: string
  status: AgentStepStatus
  details?: string
}

export interface AssistantTextDeltaEvent {
  type: 'assistant_text_delta'
  text: string
}

export interface ToolCallEvent {
  type: 'tool_call'
  tool: string
  inputSummary?: string
}

export interface ToolResultEvent {
  type: 'tool_result'
  tool: string
  status: 'success' | 'error'
  outputSummary?: string
  durationMs?: number
  retryCount?: number
  errorCode?: 'input_validation' | 'runtime_exception' | 'permission_denied' | 'unknown'
}

export interface FileChangeEvent {
  type: 'file_change'
  path: string
  changeType: FileChangeType
  addedLines?: number
  removedLines?: number
  preview?: string
}

export interface SystemEvent {
  type: 'system_event'
  level: 'info' | 'warning' | 'error'
  message: string
}

export interface FinalSummaryEvent {
  type: 'final_summary'
  title: string
  lines: string[]
}

export interface LoopBudgetUpdatedEvent {
  type: 'loop_budget_updated'
  step: number
  usage: {
    steps: number
    toolCalls: number
    elapsedMs: number
    estimatedTokens: number
  }
  budget: {
    maxSteps: number
    maxToolCalls: number
    maxElapsedMs: number
    maxTokens?: number
  }
}

export interface LoopVerificationResultEvent {
  type: 'loop_verification_result'
  step: number
  ok: boolean
  confidence: number
  reason: string
  gaps: string[]
}

export interface LoopStoppedEvent {
  type: 'loop_stopped'
  step: number
  failures: number
  stopReason: string
}

export type AgentEvent =
  | AgentStepEvent
  | AssistantTextDeltaEvent
  | ToolCallEvent
  | ToolResultEvent
  | FileChangeEvent
  | SystemEvent
  | FinalSummaryEvent
  | LoopBudgetUpdatedEvent
  | LoopVerificationResultEvent
  | LoopStoppedEvent

export interface AgentEventEnvelope {
  seq: number
  ts: string
  event: AgentEvent
}

export interface AgentEventSink {
  onEvent(event: AgentEventEnvelope): void | Promise<void>
  flush?(): Promise<void>
}

export class AgentEventBus {
  private seq = 0

  constructor(private readonly sinks: AgentEventSink[]) {}

  emit(event: AgentEvent): void {
    const envelope: AgentEventEnvelope = {
      seq: ++this.seq,
      ts: new Date().toISOString(),
      event
    }
    for (const sink of this.sinks) {
      try {
        const maybePromise = sink.onEvent(envelope)
        if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
          void (maybePromise as Promise<void>).catch(() => undefined)
        }
      } catch {
        // Nao interromper a execucao do agente por falha de renderer/log.
      }
    }
  }

  async flush(): Promise<void> {
    for (const sink of this.sinks) {
      if (typeof sink.flush === 'function') {
        await sink.flush()
      }
    }
  }
}
