import type http from 'node:http'
import { randomUUID } from 'node:crypto'
import type { UiFeedbackController, LoopUsage, LoopBudget } from './ui-feedback.js'
import { emit } from '../server/sse-emitter.js'

export class SseUiFeedback implements UiFeedbackController {
  private fullText = ''
  private reasoningText = ''

  constructor(private readonly res: http.ServerResponse) {}

  getFullText(): string {
    return this.fullText
  }

  routeDecision(intent: string, reason?: string): void {
    emit(this.res, 'route-decision', {
      intent,
      route: intent,
      ...(reason !== undefined ? { reason } : {}),
      confidence: 1.0,
    })
  }

  textDelta(text: string): void {
    this.fullText += text
    emit(this.res, 'text-delta', { delta: text, fullText: this.fullText })
  }

  reasoning(text: string): void {
    this.reasoningText += text
    emit(this.res, 'reasoning', { fullText: this.reasoningText })
  }

  stepStart(id: string, label: string, description?: string): void {
    emit(this.res, 'step-start', {
      stepId: id,
      label,
      ...(description !== undefined ? { description } : {}),
    })
  }

  stepComplete(id: string, description?: string): void {
    emit(this.res, 'step-complete', {
      stepId: id,
      ...(description !== undefined ? { description } : {}),
    })
  }

  stepError(id: string, description?: string): void {
    emit(this.res, 'step-error', {
      stepId: id,
      ...(description !== undefined ? { description } : {}),
    })
  }

  planStart(planId: string, title: string, steps: { id: string; title: string }[]): void {
    emit(this.res, 'plan', {
      planId,
      title,
      steps: steps.map((s) => ({ id: s.id, title: s.title, status: 'pending' })),
    })
  }

  planStepUpdate(planId: string, stepId: string, status: string): void {
    emit(this.res, 'plan-step-update', { planId, stepId, status })
  }

  toolStart(toolId: string, toolName: string, inputSummary?: string): void {
    emit(this.res, 'status', { phase: 'executing-tool', label: toolName })
    emit(this.res, 'tool-call', {
      toolId,
      toolName,
      input: inputSummary ?? null,
      lifecycle: 'requested',
    })
  }

  toolSuccess(toolId: string, outputSummary?: string, durationMs?: number): void {
    emit(this.res, 'tool-result', {
      toolId,
      lifecycle: 'success',
      output: outputSummary ?? null,
      ...(durationMs !== undefined ? { durationMs } : {}),
    })
    emit(this.res, 'status', { phase: 'processing', label: '' })
  }

  toolError(toolId: string, errorMessage: string, errorCode?: string): void {
    emit(this.res, 'tool-result', {
      toolId,
      lifecycle: 'error',
      output: errorMessage,
      ...(errorCode !== undefined ? { errorCode } : {}),
    })
    emit(this.res, 'status', { phase: 'processing', label: '' })
  }

  fileCreated(path: string, addedLines?: number, preview?: string): void {
    emit(this.res, 'source-reference', {
      docId: path,
      role: 'created',
      changeType: 'new',
      ...(addedLines !== undefined ? { addedLines } : {}),
      ...(preview !== undefined ? { preview } : {}),
    })
  }

  fileEdited(path: string, addedLines?: number, removedLines?: number): void {
    emit(this.res, 'source-reference', {
      docId: path,
      changeType: 'edited',
      ...(addedLines !== undefined ? { addedLines } : {}),
      ...(removedLines !== undefined ? { removedLines } : {}),
    })
  }

  fileDeleted(path: string): void {
    emit(this.res, 'source-reference', { docId: path, changeType: 'deleted' })
  }

  requestApproval(requestId: string, title: string, description?: string): void {
    emit(this.res, 'status', { phase: 'awaiting-approval', label: title })
    emit(this.res, 'approval-request', {
      requestId,
      title,
      ...(description !== undefined ? { description } : {}),
    })
  }

  systemInfo(message: string): void {
    emit(this.res, 'step-start', {
      stepId: `info-${randomUUID().slice(0, 8)}`,
      label: message,
      level: 'info',
      autoComplete: true,
    })
  }

  systemWarn(message: string): void {
    emit(this.res, 'step-start', {
      stepId: `warn-${randomUUID().slice(0, 8)}`,
      label: `⚠ ${message}`,
      level: 'warning',
      autoComplete: true,
    })
  }

  systemError(message: string): void {
    emit(this.res, 'error', { message })
  }

  summary(title: string, lines: string[]): void {
    const summaryText = `**${title}**\n\n${lines.map((l) => `- ${l}`).join('\n')}`
    const separator = this.fullText.length > 0 ? '\n\n' : ''
    this.fullText += separator + summaryText
    emit(this.res, 'text-delta', { delta: separator + summaryText, fullText: this.fullText })
  }

  loopProgress(step: number, usage: LoopUsage, budget: LoopBudget): void {
    emit(this.res, 'step-start', {
      stepId: `loop-${step}`,
      label: `Loop step ${step}: ${usage.toolCalls}/${budget.maxToolCalls} tool calls`,
      level: 'info',
      autoComplete: true,
    })
  }

  loopVerification(step: number, ok: boolean, confidence: number, reason: string, _gaps: string[]): void {
    const status = ok ? 'Verificado' : 'Falhou'
    const id = `verify-${step}`
    if (ok) {
      emit(this.res, 'step-start', {
        stepId: id,
        label: `${status} (confiança ${(confidence * 100).toFixed(0)}%): ${reason}`,
        autoComplete: true,
      })
    } else {
      emit(this.res, 'step-error', {
        stepId: id,
        label: `${status} (confiança ${(confidence * 100).toFixed(0)}%): ${reason}`,
      })
    }
  }

  loopStopped(step: number, _failures: number, stopReason: string): void {
    emit(this.res, 'step-complete', {
      stepId: `loop-stop-${step}`,
      label: `Loop parado: ${stopReason}`,
    })
  }

  tokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number }): void {
    const data: Record<string, unknown> = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    }
    if (usage.cachedInputTokens !== undefined) {
      data['cachedInputTokens'] = usage.cachedInputTokens
    }
    emit(this.res, 'token-usage', data)
  }

  artifact(params: { title: string; content: string; language?: string; path?: string }): void {
    emit(this.res, 'artifact', {
      title: params.title,
      content: params.content,
      ...(params.language !== undefined ? { language: params.language } : {}),
      ...(params.path !== undefined ? { path: params.path } : {}),
    })
  }

  suggestions(items: Array<{ id: string; text: string }>): void {
    emit(this.res, 'suggestions', { items })
  }

  sourceConsulted(docId: string, docName?: string): void {
    emit(this.res, 'source-reference', {
      docId,
      role: 'consulted',
      ...(docName !== undefined ? { docName } : {}),
    })
  }

  leadSuggestion(lead: {
    leadId: string
    slug: string
    title: string
    description: string
    inquiryPlan?: string
    status: 'draft' | 'planned'
  }): void {
    emit(this.res, 'lead-suggestion', {
      leadId: lead.leadId,
      slug: lead.slug,
      title: lead.title,
      description: lead.description,
      status: lead.status,
      ...(lead.inquiryPlan !== undefined ? { inquiryPlan: lead.inquiryPlan } : {}),
    })
  }

  allegation(params: {
    id: string
    title: string
    leadSlug: string
    status: string
    findings: Array<{ id: string; text: string; status: string; sourceRefs?: string[] }>
  }): void {
    emit(this.res, 'allegation', {
      id: params.id,
      title: params.title,
      leadSlug: params.leadSlug,
      status: params.status,
      findings: params.findings,
    })
  }

  queueStart(queueId: string, steps: Array<{ id: string; label: string }>): void {
    emit(this.res, 'queue-start', {
      queueId,
      steps: steps.map((s) => ({ id: s.id, label: s.label, status: 'pending' })),
    })
  }

  queueStepUpdate(queueId: string, stepId: string, status: 'running' | 'done' | 'error' | 'aborted'): void {
    emit(this.res, 'queue-step-update', { queueId, stepId, status })
  }

  queueAbort(queueId: string): void {
    emit(this.res, 'queue-abort', { queueId })
  }

  async flush(): Promise<void> {
    // SSE writes are immediate
  }
}
