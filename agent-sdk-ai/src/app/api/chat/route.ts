import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { classifyIntent } from '@/agent/router'
import { buildSystemPrompt } from '@/agent/system-prompt'
import { buildWorkflowGuidance } from '@/agent/workflow-engine'
import { buildQueuePlan } from '@/agent/queue-planner'
import { createReversoAgent } from '@/agent/reverso-agent'
import { resolveConfig } from '@/lib/config'
import { detectSystemState } from '@/lib/source-state'
import { loadActiveDeepDiveSession } from '@/lib/session-store'
import { persistChat } from '@/lib/chat-persistence'
import type { ReversoUIMessage } from '@/types/ui-message'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ChatRequestBody {
  messages?: unknown[]
  autoAccept?: boolean
}

function extractLatestUserText(messages: unknown[]): string {
  const lastUser = [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as Record<string, unknown>)['role'] === 'user'
    ) as Record<string, unknown> | undefined

  if (!lastUser) return ''
  const parts = Array.isArray(lastUser['parts']) ? (lastUser['parts'] as unknown[]) : []
  const textParts = parts.filter(
    (part) =>
      typeof part === 'object' &&
      part !== null &&
      (part as Record<string, unknown>)['type'] === 'text' &&
      typeof (part as Record<string, unknown>)['text'] === 'string'
  ) as Array<Record<string, string>>

  return textParts.map((part) => part.text).join('\n').trim()
}

function normalizeMessages(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export async function POST(req: Request): Promise<Response> {
  const config = resolveConfig()
  const body = (await req.json()) as ChatRequestBody
  const uiMessages = normalizeMessages(body.messages)
  const originalMessages = uiMessages as ReversoUIMessage[]
  const userText = extractLatestUserText(uiMessages)

  const [state, session, intent] = await Promise.all([
    detectSystemState(config.paths),
    loadActiveDeepDiveSession(config.paths),
    classifyIntent(userText || 'mensagem vazia'),
  ])

  const workflow = buildWorkflowGuidance({ intent, state, session })
  const systemPrompt = buildSystemPrompt({
    state,
    session,
    intent,
    autoAccept: body.autoAccept ?? config.autoAcceptDefault,
  })

  const dynamicInstructions = [
    systemPrompt,
    '',
    'Pré-flight guidance para esta mensagem:',
    ...workflow.preflight.map((line) => `- ${line}`),
  ].join('\n')

  const agent = createReversoAgent({ dynamicInstructions })
  const autoAccept = body.autoAccept ?? config.autoAcceptDefault
  const queuePlan = buildQueuePlan({
    preflight: workflow.preflight,
    intent: intent.intent,
  })

  const stream = createUIMessageStream<ReversoUIMessage>({
    originalMessages,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      return `Erro no agente: ${message}`
    },
    onFinish: async ({ messages }) => {
      await persistChat(config.paths, messages)
    },
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-workflow',
        data: {
          phase: 'preflight',
          message: 'Analisando estado do sistema e planejando fila de execução.',
        },
        transient: true,
      })

      writer.write({
        type: 'data-queue',
        id: 'workflow-queue',
        data: {
          steps: queuePlan.steps,
          currentStep: 0,
          totalSteps: queuePlan.totalSteps,
        },
      })

      writer.write({
        type: 'data-suggestion',
        data: {
          title: 'Modo de aprovação',
          action: autoAccept
            ? 'Auto-accept está ativo; ferramentas sensíveis serão executadas automaticamente.'
            : 'Auto-accept está desligado; você precisará aprovar ferramentas sensíveis.',
        },
        transient: true,
      })

      const agentStream = await createAgentUIStream({
        agent,
        uiMessages,
        options: {
          autoAccept,
        },
        sendReasoning: true,
        sendSources: true,
        messageMetadata: ({ part }) => {
          if (part.type === 'start') {
            return {
              intent: intent.intent,
              confidence: intent.confidence,
              timestamp: Date.now(),
            }
          }
          return undefined
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : String(error)
          return `Erro no agente: ${message}`
        },
      })

      writer.write({
        type: 'data-workflow',
        data: {
          phase: 'execution',
          message: 'Executando ações do workflow com tool loop.',
        },
        transient: true,
      })

      writer.write({
        type: 'data-queue',
        id: 'workflow-queue',
        data: {
          steps: queuePlan.steps,
          currentStep: Math.max(0, queuePlan.steps.length - 1),
          totalSteps: queuePlan.totalSteps,
        },
      })

      writer.merge(agentStream)
    },
  })

  return createUIMessageStreamResponse({ stream })
}
