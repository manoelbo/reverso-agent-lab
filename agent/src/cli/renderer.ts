import { appendFile } from 'node:fs/promises'
import path from 'node:path'
import { ensureDir } from '../core/fs-io.js'
import type { AgentEventEnvelope, AgentEventSink, AgentStepStatus } from './events.js'
import { AgentEventBus } from './events.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { CliUiFeedback } from '../feedback/cli-ui-feedback.js'

export type FeedbackMode = 'plain' | 'compact' | 'visual'

export type { UiFeedbackController }

/**
 * @deprecated Use `UiFeedbackController` directly. This alias exists for backward compatibility.
 */
export type FeedbackController = UiFeedbackController

export interface RendererAdapter extends AgentEventSink {}

class CompactRenderer implements RendererAdapter {
  onEvent(envelope: AgentEventEnvelope): void {
    const { event } = envelope
    switch (event.type) {
      case 'agent_step':
        console.log(
          `${statusIcon(event.status)} ${event.label}${event.details ? ` — ${event.details}` : ''}`
        )
        return
      case 'assistant_text_delta':
        process.stdout.write(event.text)
        return
      case 'tool_call':
        console.log(`→ Tool: ${event.tool}${event.inputSummary ? ` (${event.inputSummary})` : ''}`)
        return
      case 'tool_result':
        console.log(
          `${event.status === 'success' ? '✓' : 'x'} Tool ${event.tool}${event.outputSummary ? ` — ${event.outputSummary}` : ''}${typeof event.durationMs === 'number' ? ` | ${event.durationMs}ms` : ''}${typeof event.retryCount === 'number' ? ` | retry=${event.retryCount}` : ''}${event.errorCode ? ` | ${event.errorCode}` : ''}`
        )
        return
      case 'file_change':
        console.log(
          `${fileIcon(event.changeType)} ${event.path}${formatDelta(event.addedLines, event.removedLines)}`
        )
        return
      case 'system_event':
        console.log(`[${event.level}] ${event.message}`)
        return
      case 'final_summary':
        console.log(`\n${event.title}`)
        for (const line of event.lines) console.log(`- ${line}`)
        return
      case 'loop_budget_updated':
        console.log(
          `↺ Loop budget step=${event.step} tools=${event.usage.toolCalls}/${event.budget.maxToolCalls} steps=${event.usage.steps}/${event.budget.maxSteps}`
        )
        return
      case 'loop_verification_result':
        console.log(
          `${event.ok ? '✓' : 'x'} Loop verify step=${event.step} confidence=${event.confidence.toFixed(2)} reason=${event.reason}`
        )
        return
      case 'loop_stopped':
        console.log(
          `■ Loop stopped step=${event.step} failures=${event.failures} reason=${event.stopReason}`
        )
        return
    }
  }
}

class VisualRenderer implements RendererAdapter {
  onEvent(envelope: AgentEventEnvelope): void {
    const { event } = envelope
    switch (event.type) {
      case 'agent_step':
        this.printBox(`STEP ${statusLabel(event.status)}`, [
          event.label,
          ...(event.details ? [event.details] : [])
        ])
        return
      case 'assistant_text_delta':
        process.stdout.write(event.text)
        return
      case 'tool_call':
        this.printBox('TOOL CALL', [
          `${event.tool}${event.inputSummary ? ` | ${event.inputSummary}` : ''}`
        ])
        return
      case 'tool_result':
        this.printBox(`TOOL RESULT ${event.status.toUpperCase()}`, [
          `${event.tool}${event.outputSummary ? ` | ${event.outputSummary}` : ''}${typeof event.durationMs === 'number' ? ` | ${event.durationMs}ms` : ''}${typeof event.retryCount === 'number' ? ` | retry=${event.retryCount}` : ''}${event.errorCode ? ` | ${event.errorCode}` : ''}`
        ])
        return
      case 'file_change':
        this.printBox(`FILE ${event.changeType.toUpperCase()}`, [
          event.path,
          `${formatDelta(event.addedLines, event.removedLines).trim() || 'no line delta'}`,
          ...(event.preview ? [event.preview] : [])
        ])
        return
      case 'system_event':
        this.printBox(`SYSTEM ${event.level.toUpperCase()}`, [event.message])
        return
      case 'final_summary':
        this.printBox(event.title, event.lines)
        return
      case 'loop_budget_updated':
        this.printBox('LOOP BUDGET', [
          `step=${event.step}`,
          `steps ${event.usage.steps}/${event.budget.maxSteps}`,
          `tool calls ${event.usage.toolCalls}/${event.budget.maxToolCalls}`,
          `elapsed ${event.usage.elapsedMs}ms/${event.budget.maxElapsedMs}ms`
        ])
        return
      case 'loop_verification_result':
        this.printBox(`LOOP VERIFY ${event.ok ? 'PASS' : 'FAIL'}`, [
          `step=${event.step}`,
          `confidence=${event.confidence.toFixed(2)}`,
          `reason=${event.reason}`,
          ...(event.gaps.length ? [`gaps: ${event.gaps.join('; ')}`] : [])
        ])
        return
      case 'loop_stopped':
        this.printBox('LOOP STOPPED', [
          `step=${event.step}`,
          `failures=${event.failures}`,
          `reason=${event.stopReason}`
        ])
        return
    }
  }

  private printBox(title: string, lines: string[]): void {
    const content = [title, ...lines].filter(Boolean)
    const width = Math.max(28, ...content.map((line) => line.length)) + 2
    const top = `+${'-'.repeat(width)}+`
    console.log(top)
    for (const line of content) {
      console.log(`| ${line.padEnd(width - 1, ' ')}|`)
    }
    console.log(top)
  }
}

class JsonlEventLogSink implements AgentEventSink {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  onEvent(envelope: AgentEventEnvelope): void {
    const line = `${JSON.stringify(envelope)}\n`
    this.queue = this.queue.then(async () => {
      await ensureDir(path.dirname(this.filePath))
      await appendFile(this.filePath, line, 'utf8')
    })
  }

  async flush(): Promise<void> {
    await this.queue
  }
}

interface CreateFeedbackControllerInput {
  mode?: FeedbackMode
  eventsDir: string
  sessionName: string
}

export async function createFeedbackController(
  input: CreateFeedbackControllerInput
): Promise<UiFeedbackController> {
  const mode = input.mode ?? 'visual'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logPath = path.join(input.eventsDir, `${input.sessionName}-${timestamp}.jsonl`)

  const sinks: AgentEventSink[] = [new JsonlEventLogSink(logPath)]
  if (mode === 'compact') sinks.unshift(new CompactRenderer())
  if (mode === 'visual') sinks.unshift(new VisualRenderer())
  if (mode === 'plain') sinks.unshift(new CompactRenderer())

  const bus = new AgentEventBus(sinks)
  return new CliUiFeedback(bus, logPath)
}

function statusIcon(status: AgentStepStatus): string {
  if (status === 'completed') return '✓'
  if (status === 'blocked') return 'x'
  if (status === 'pending') return '...'
  return '→'
}

function statusLabel(status: AgentStepStatus): string {
  if (status === 'completed') return 'DONE'
  if (status === 'blocked') return 'BLOCKED'
  if (status === 'pending') return 'PENDING'
  return 'RUNNING'
}

function fileIcon(changeType: 'new' | 'edited' | 'deleted'): string {
  if (changeType === 'new') return '+'
  if (changeType === 'deleted') return '-'
  return '~'
}

function formatDelta(addedLines?: number, removedLines?: number): string {
  if (typeof addedLines !== 'number' && typeof removedLines !== 'number') return ''
  return ` (+${addedLines ?? 0} / -${removedLines ?? 0})`
}
