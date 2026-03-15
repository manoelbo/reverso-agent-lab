import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { classifyIntent } from '@/agent/router'
import { buildSystemPrompt } from '@/agent/system-prompt'
import { createReversoAgent } from '@/agent/reverso-agent'
import { resolveConfig } from '@/lib/config'
import { persistChat } from '@/lib/chat-persistence'
import { loadWorkflowSnapshot } from '@/lib/workflow-state'
import type { ReversoUIMessage } from '@/types/ui-message'
import { extractLatestUserText, normalizeMessages } from './route-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ChatRequestBody {
  messages?: unknown[]
  autoAccept?: boolean
}

export async function POST(req: Request): Promise<Response> {
  const config = resolveConfig()
  const body = (await req.json()) as ChatRequestBody
  const uiMessages = normalizeMessages(body.messages)
  const originalMessages = uiMessages as ReversoUIMessage[]
  const userText = extractLatestUserText(uiMessages)

  const workflow = await loadWorkflowSnapshot({
    paths: config.paths,
    userText,
    classifyIntent,
  })

  const systemPrompt = buildSystemPrompt({
    state: workflow.state,
    session: workflow.session,
    intent: workflow.intent,
    autoAccept: body.autoAccept ?? config.autoAcceptDefault,
  })

  const dynamicInstructions = [
    systemPrompt,
    '',
    'Pré-flight guidance para esta mensagem:',
    ...workflow.guidance.preflight.map((line) => `- ${line}`),
  ].join('\n')

  const agent = createReversoAgent({ dynamicInstructions })
  const autoAccept = body.autoAccept ?? config.autoAcceptDefault
  const { queuePlan } = workflow

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
        type: 'data-sourceState',
        id: 'workflow-source-state',
        data: {
          sourceEmpty: workflow.state.sourceEmpty,
          processed: workflow.state.processedFiles.length,
          pending: workflow.state.unprocessedFiles.length,
          failed: workflow.state.failedFiles.length,
        },
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
              intent: workflow.intent.intent,
              confidence: workflow.intent.confidence,
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
