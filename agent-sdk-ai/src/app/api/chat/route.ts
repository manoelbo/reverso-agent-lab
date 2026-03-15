import { createAgentUIStreamResponse } from 'ai'
import { classifyIntent } from '@/agent/router'
import { buildSystemPrompt } from '@/agent/system-prompt'
import { buildWorkflowGuidance } from '@/agent/workflow-engine'
import { createReversoAgent } from '@/agent/reverso-agent'
import { resolveConfig } from '@/lib/config'
import { detectSystemState } from '@/lib/source-state'
import { loadActiveDeepDiveSession, saveChatMessages } from '@/lib/session-store'

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

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
    options: {
      autoAccept: body.autoAccept ?? config.autoAcceptDefault,
    },
    sendReasoning: true,
    sendSources: true,
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error)
      return `Erro no agente: ${message}`
    },
    onFinish: async ({ messages }) => {
      await saveChatMessages(config.paths, messages)
    },
  })
}
