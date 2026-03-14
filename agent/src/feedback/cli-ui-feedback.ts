import type { AgentEventBus } from '../cli/events.js'
import type { UiFeedbackController, LoopUsage, LoopBudget } from './ui-feedback.js'

/**
 * Implements UiFeedbackController by translating UI-oriented calls
 * into AgentEventBus events for CLI rendering and JSONL logging.
 */
export class CliUiFeedback implements UiFeedbackController {
  private fullText = ''
  private stepLabels = new Map<string, string>()

  constructor(
    private readonly bus: AgentEventBus,
    readonly logPath: string,
  ) {}

  getFullText(): string {
    return this.fullText
  }

  routeDecision(intent: string, reason?: string): void {
    this.bus.emit({
      type: 'agent_step',
      label: `Rota: ${intent}`,
      status: 'completed',
      ...(reason ? { details: reason } : {}),
    })
  }

  textDelta(text: string): void {
    this.fullText += text
    this.bus.emit({ type: 'assistant_text_delta', text })
  }

  reasoning(text: string): void {
    this.bus.emit({ type: 'assistant_text_delta', text })
  }

  stepStart(id: string, label: string, description?: string): void {
    this.stepLabels.set(id, label)
    this.bus.emit({
      type: 'agent_step',
      label,
      status: 'in_progress',
      ...(description ? { details: description } : {}),
    })
  }

  stepComplete(id: string, description?: string): void {
    const label = this.stepLabels.get(id) ?? id
    this.bus.emit({
      type: 'agent_step',
      label,
      status: 'completed',
      ...(description ? { details: description } : {}),
    })
  }

  stepError(id: string, description?: string): void {
    const label = this.stepLabels.get(id) ?? id
    this.bus.emit({
      type: 'agent_step',
      label,
      status: 'blocked',
      ...(description ? { details: description } : {}),
    })
  }

  planStart(_planId: string, title: string, steps: { id: string; title: string }[]): void {
    this.bus.emit({
      type: 'agent_step',
      label: title,
      status: 'in_progress',
      details: `${steps.length} steps`,
    })
  }

  planStepUpdate(_planId: string, _stepId: string, status: string): void {
    this.bus.emit({
      type: 'agent_step',
      label: `Plan step ${_stepId}`,
      status: status === 'done' ? 'completed' : status === 'error' ? 'blocked' : 'in_progress',
    })
  }

  toolStart(_toolId: string, toolName: string, inputSummary?: string): void {
    this.bus.emit({ type: 'tool_call', tool: toolName, ...(inputSummary ? { inputSummary } : {}) })
  }

  toolSuccess(_toolId: string, outputSummary?: string, durationMs?: number): void {
    this.bus.emit({
      type: 'tool_result',
      tool: _toolId,
      status: 'success' as const,
      ...(outputSummary ? { outputSummary } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
    })
  }

  toolError(_toolId: string, errorMessage: string, errorCode?: string): void {
    this.bus.emit({
      type: 'tool_result',
      tool: _toolId,
      status: 'error' as const,
      outputSummary: errorMessage,
      ...(errorCode ? { errorCode: errorCode as 'runtime_exception' } : {}),
    })
  }

  fileCreated(path: string, addedLines?: number, preview?: string): void {
    this.bus.emit({
      type: 'file_change',
      path,
      changeType: 'new',
      ...(addedLines !== undefined ? { addedLines } : {}),
      ...(preview ? { preview } : {}),
    })
  }

  fileEdited(path: string, addedLines?: number, removedLines?: number): void {
    this.bus.emit({
      type: 'file_change',
      path,
      changeType: 'edited',
      ...(addedLines !== undefined ? { addedLines } : {}),
      ...(removedLines !== undefined ? { removedLines } : {}),
    })
  }

  fileDeleted(path: string): void {
    this.bus.emit({ type: 'file_change', path, changeType: 'deleted' })
  }

  requestApproval(_requestId: string, title: string, description?: string): void {
    this.bus.emit({
      type: 'system_event',
      level: 'info',
      message: description ? `${title}: ${description}` : title,
    })
  }

  systemInfo(message: string): void {
    this.bus.emit({ type: 'system_event', level: 'info', message })
  }

  systemWarn(message: string): void {
    this.bus.emit({ type: 'system_event', level: 'warning', message })
  }

  systemError(message: string): void {
    this.bus.emit({ type: 'system_event', level: 'error', message })
  }

  summary(title: string, lines: string[]): void {
    this.bus.emit({ type: 'final_summary', title, lines })
    const summaryText = `**${title}**\n\n${lines.map((l) => `- ${l}`).join('\n')}`
    const separator = this.fullText.length > 0 ? '\n\n' : ''
    this.fullText += separator + summaryText
  }

  loopProgress(step: number, usage: LoopUsage, budget: LoopBudget): void {
    this.bus.emit({ type: 'loop_budget_updated', step, usage, budget })
  }

  loopVerification(step: number, ok: boolean, confidence: number, reason: string, gaps: string[]): void {
    this.bus.emit({ type: 'loop_verification_result', step, ok, confidence, reason, gaps })
  }

  loopStopped(step: number, failures: number, stopReason: string): void {
    this.bus.emit({ type: 'loop_stopped', step, failures, stopReason })
  }

  tokenUsage(_usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number }): void {
    // CLI doesn't display token usage inline
  }

  async flush(): Promise<void> {
    await this.bus.flush()
  }
}
