import { useContext, useRef, useState, useCallback } from 'react'
import { AgentContext } from '@/providers/agent-provider'
import { useAgentChatStore } from '@/stores/agent-chat-store'
import type { AgentEvent, AgentSessionContext, ChatMessage, QueueStep, StreamState, TokenUsage, TraceStep } from '@/lib/types'
import type { UploadResult } from '@/lib/agent-transport'

const ROUTE_LABELS: Record<string, string> = {
  ask_clarify: 'Conversa direta',
  general_chat: 'Conversa direta',
  deep_dive: 'Análise profunda (deep-dive)',
  deep_dive_next: 'Continuando análise ativa',
  init: 'Configuração de contexto',
  create_lead: 'Criação de lead',
  plan_leads: 'Planejamento de leads',
  execute_inquiry: 'Execução de inquiry',
  greeting: 'Saudação',
  quick_research: 'Pesquisa rápida',
  view_data: 'Consulta de dados',
  update_agent_context: 'Atualização de contexto',
  process_documents: 'Processamento de documentos',
  abort: 'Cancelar operação',
}

function routeLabel(intent: string): string {
  return ROUTE_LABELS[intent] ?? intent
}

export interface UseAgentChatReturn {
  messages: ChatMessage[]
  streamingMessage: ChatMessage | null
  streamState: StreamState
  input: string
  setInput: (v: string) => void
  isStreaming: boolean
  autoApprove: boolean
  setAutoApprove: (v: boolean) => void
  sessionLoaded: boolean
  loadSession: () => Promise<void>
  sendMessage: (text: string, attachments?: import('@/lib/types').ChatAttachment[]) => void
  addLocalUserMessage: (text: string, attachments?: import('@/lib/types').ChatAttachment[]) => void
  startProcessing: (fileIds?: string[]) => void
  approveAction: (requestId: string, approved: boolean) => void
  cancelCurrentRequest: () => void
  retryLastMessage: () => void
  uploadFiles: (files: File[]) => Promise<UploadResult>
  sessionContext: AgentSessionContext | null
  connected: boolean
  lastTurnUsage: TokenUsage | null
  sessionTotalTokens: number
}

export function useAgentChat(): UseAgentChatReturn {
  const transport = useContext(AgentContext)
  const store = useAgentChatStore()
  const abortRef = useRef<boolean>(false)
  const lastSubmittedRef = useRef<string>('')
  const [sessionLoaded, setSessionLoaded] = useState(false)

  const refreshContext = useCallback(async (): Promise<void> => {
    if (!transport) return
    try {
      const ctx = await transport.getAgentContext()
      store.setSessionContext(ctx)
      store.setConnected(true)
    } catch {
      store.setConnected(false)
    }
  }, [transport, store.setSessionContext, store.setConnected])

  const loadSession = useCallback(async (): Promise<void> => {
    if (!transport) {
      setSessionLoaded(true)
      return
    }
    try {
      const messages = await transport.getSession()
      store.loadPersistedMessages(messages)
    } catch (err) {
      console.error('[useAgentChat] Failed to load session:', err)
    }
    // Load agent context alongside session (parallel is fine)
    await refreshContext()
    setSessionLoaded(true)
  }, [transport, store.loadPersistedMessages, refreshContext])

  const approveAction = (requestId: string, approved: boolean): void => {
    store.updateConfirmationState(requestId, approved ? 'approved' : 'rejected')
    if (!transport) return
    transport.sendApproval(requestId, approved).catch((err: unknown) => {
      console.error('[useAgentChat] sendApproval error:', err)
    })
  }

  const cancelCurrentRequest = useCallback((): void => {
    const requestId = store.currentRequestId
    if (!requestId || !transport) return
    transport.cancelRequest(requestId).catch((err: unknown) => {
      console.error('[useAgentChat] cancelRequest error:', err)
    })
  }, [transport, store.currentRequestId])

  const retryLastMessage = useCallback((): void => {
    cancelCurrentRequest()
    const last = lastSubmittedRef.current
    if (last) {
      store.setInput(last)
    }
  }, [cancelCurrentRequest, store.setInput])

  const uploadFiles = useCallback(async (files: File[]): Promise<UploadResult> => {
    if (!transport) {
      return { accepted: [], rejected: files.map((f) => f.name), reasons: {} }
    }
    return transport.uploadFiles(files)
  }, [transport])

  const consumeSseStream = useCallback(async (events: AsyncIterable<AgentEvent>): Promise<void> => {
    try {
      for await (const event of events) {
        if (abortRef.current) break

        if (event.type === 'status') {
          const phase = event.data['phase']
          const label = event.data['label']
          const requestId = event.data['requestId']
          if (typeof phase === 'string') {
            store.setStreamState({ phase: phase as import('@/lib/types').StreamPhase })
          }
          if (typeof requestId === 'string' && requestId && !store.currentRequestId) {
            store.setCurrentRequestId(requestId)
          }
          void label
        } else if (event.type === 'text-delta') {
          const fullText = event.data['fullText']
          if (typeof fullText === 'string') {
            store.updateStreamingText(fullText)
          }
        } else if (event.type === 'reasoning') {
          const fullText = event.data['fullText']
          if (typeof fullText === 'string') {
            store.updateStreamingReasoning(fullText)
          }
        } else if (event.type === 'route-decision') {
          const intent = event.data['intent']
          const route = event.data['route']
          const reason = event.data['reason']
          if (typeof intent === 'string' && typeof route === 'string') {
            store.setStreamingRouteDecision({
              intent,
              route,
              reason: typeof reason === 'string' ? reason : undefined,
            })
            const routingStep: TraceStep = {
              id: 'route',
              type: 'routing',
              label: routeLabel(intent),
              description: typeof reason === 'string' ? reason : undefined,
              status: 'complete',
              startedAt: Date.now(),
              endedAt: Date.now(),
            }
            store.addTraceStep(routingStep)
          }
        } else if (event.type === 'plan') {
          const { planId, title, steps } = event.data
          if (typeof planId === 'string' && typeof title === 'string' && Array.isArray(steps)) {
            store.addPlanPart(planId, title, steps as import('@/lib/types').PlanStep[])
          }
        } else if (event.type === 'plan-step-update') {
          const { planId, stepId, status } = event.data
          if (
            typeof planId === 'string' &&
            typeof stepId === 'string' &&
            typeof status === 'string'
          ) {
            store.updatePlanStep(
              planId,
              stepId,
              status as import('@/lib/types').PlanStep['status'],
            )
          }
        } else if (event.type === 'tool-call') {
          const toolId = event.data['toolId']
          const toolName = event.data['toolName']
          const input = event.data['input']
          const lifecycle = event.data['lifecycle']
          if (typeof toolId === 'string' && typeof lifecycle === 'string') {
            if (lifecycle === 'requested') {
              const resolvedName = typeof toolName === 'string' ? toolName : toolId
              store.addToolCallPart(toolId, resolvedName, input)
              const toolStep: TraceStep = {
                id: toolId,
                type: 'tool',
                label: resolvedName,
                status: 'active',
                startedAt: Date.now(),
              }
              store.addTraceStep(toolStep)
            } else {
              store.updateToolLifecycle(toolId, lifecycle as import('@/lib/types').ToolLifecycle)
            }
          }
        } else if (event.type === 'approval-request') {
          const { requestId, title, description } = event.data
          if (typeof requestId === 'string' && typeof title === 'string') {
            if (store.autoApprove) {
              approveAction(requestId, true)
            } else {
              store.addConfirmationPart(
                requestId,
                title,
                typeof description === 'string' ? description : undefined,
              )
            }
          }
        } else if (event.type === 'source-reference') {
          const { docId, page, role, docName } = event.data
          if (typeof docId === 'string') {
            store.addSourceReference(
              docId,
              typeof page === 'number' ? page : undefined,
              (role === 'consulted' || role === 'created') ? role : undefined,
              typeof docName === 'string' ? docName : undefined,
            )
          }
        } else if (event.type === 'tool-result') {
          const toolId = event.data['toolId']
          const output = event.data['output']
          const error = event.data['error']
          const lifecycle = event.data['lifecycle']
          if (typeof toolId === 'string' && typeof lifecycle === 'string') {
            store.updateToolLifecycle(
              toolId,
              lifecycle as import('@/lib/types').ToolLifecycle,
              output,
              typeof error === 'string' ? error : undefined,
            )
            store.updateTraceStep(toolId, {
              status: lifecycle === 'success' ? 'complete' : 'error',
              endedAt: Date.now(),
            })
          }
        } else if (event.type === 'step-start') {
          const stepId = event.data['stepId']
          const label = event.data['label']
          const description = event.data['description']
          const autoComplete = event.data['autoComplete']
          if (typeof stepId === 'string' && typeof label === 'string') {
            const step: TraceStep = {
              id: stepId,
              type: 'step',
              label,
              description: typeof description === 'string' ? description : undefined,
              status: autoComplete === true ? 'complete' : 'active',
              startedAt: Date.now(),
              ...(autoComplete === true ? { endedAt: Date.now() } : {}),
            }
            store.addTraceStep(step)
          }
        } else if (event.type === 'step-complete') {
          const stepId = event.data['stepId']
          const description = event.data['description']
          if (typeof stepId === 'string') {
            store.updateTraceStep(stepId, {
              status: 'complete',
              endedAt: Date.now(),
              ...(typeof description === 'string' ? { description } : {}),
            })
          }
        } else if (event.type === 'step-error') {
          const stepId = event.data['stepId']
          const description = event.data['description']
          if (typeof stepId === 'string') {
            store.updateTraceStep(stepId, {
              status: 'error',
              endedAt: Date.now(),
              ...(typeof description === 'string' ? { description } : {}),
            })
          }
        } else if (event.type === 'token-usage') {
          const { inputTokens, outputTokens, totalTokens, cachedInputTokens } = event.data
          if (typeof inputTokens === 'number' && typeof outputTokens === 'number') {
            store.setTokenUsage({
              inputTokens,
              outputTokens,
              totalTokens: typeof totalTokens === 'number' ? totalTokens : inputTokens + outputTokens,
              cachedInputTokens: typeof cachedInputTokens === 'number' ? cachedInputTokens : undefined,
            })
          }
        } else if (event.type === 'queue-start') {
          const { queueId, steps } = event.data
          if (typeof queueId === 'string' && Array.isArray(steps)) {
            store.startQueuePart(queueId, steps as QueueStep[])
          }
        } else if (event.type === 'queue-step-update') {
          const { queueId, stepId, status } = event.data
          if (
            typeof queueId === 'string' &&
            typeof stepId === 'string' &&
            typeof status === 'string'
          ) {
            store.updateQueueStep(queueId, stepId, status as QueueStep['status'])
          }
        } else if (event.type === 'queue-abort') {
          const { queueId } = event.data
          if (typeof queueId === 'string') {
            store.abortQueue(queueId)
          }
        } else if (event.type === 'abort-ack') {
          store.clearRetryParts()
        } else if (event.type === 'retry') {
          const { attempt, maxAttempts, delaySec, errorSnippet } = event.data
          if (typeof attempt === 'number' && typeof maxAttempts === 'number') {
            store.addRetryPart(
              attempt,
              maxAttempts,
              typeof delaySec === 'number' ? delaySec : 2,
              typeof errorSnippet === 'string' ? errorSnippet : '',
            )
          }
        } else if (event.type === 'artifact') {
          const { title, content, language, path: artifactPath } = event.data
          if (typeof title === 'string' && typeof content === 'string') {
            store.addArtifactPart({
              title,
              content,
              language: typeof language === 'string' ? language : undefined,
              path: typeof artifactPath === 'string' ? artifactPath : undefined,
            })
          }
        } else if (event.type === 'lead-suggestion') {
          const { leadId, slug, title, description, inquiryPlan, status } = event.data
          if (typeof leadId === 'string' && typeof slug === 'string' && typeof title === 'string') {
            store.addLeadSuggestionPart({
              leadId,
              slug,
              title,
              description: typeof description === 'string' ? description : '',
              inquiryPlan: typeof inquiryPlan === 'string' ? inquiryPlan : undefined,
              status: (status === 'draft' || status === 'planned' || status === 'rejected')
                ? status
                : undefined,
            })
          }
        } else if (event.type === 'allegation') {
          const { id, title, leadSlug, status, findings } = event.data
          if (
            typeof id === 'string' &&
            typeof title === 'string' &&
            typeof leadSlug === 'string' &&
            Array.isArray(findings)
          ) {
            store.addAllegationPart({
              id,
              title,
              leadSlug,
              status: (status === 'accepted' || status === 'rejected') ? status : 'pending',
              findings: (findings as Array<Record<string, unknown>>).map((f) => {
                const rawStatus = f['status']
                const fStatus: 'unverified' | 'verified' | 'rejected' =
                  rawStatus === 'verified' || rawStatus === 'rejected' ? rawStatus : 'unverified'
                return {
                  id: typeof f['id'] === 'string' ? f['id'] : '',
                  text: typeof f['text'] === 'string' ? f['text'] : '',
                  status: fStatus,
                  sourceRefs: Array.isArray(f['sourceRefs'])
                    ? (f['sourceRefs'] as unknown[]).filter((r): r is string => typeof r === 'string')
                    : undefined,
                }
              }).filter((f) => f.id && f.text),
            })
          }
        } else if (event.type === 'suggestions') {
          const items = event.data['items']
          if (Array.isArray(items)) {
            store.addSuggestionsPart(
              items.filter(
                (item): item is { id: string; text: string } =>
                  typeof item === 'object' &&
                  item !== null &&
                  typeof (item as Record<string, unknown>)['id'] === 'string' &&
                  typeof (item as Record<string, unknown>)['text'] === 'string',
              ),
            )
          }
        } else if (event.type === 'done') {
          store.clearRetryParts()
          store.setCurrentRequestId(null)
          store.finalizeStreamingMessage()
          store.setStreamState({ phase: 'idle', error: undefined })
          void refreshContext()
        } else if (event.type === 'error') {
          const message = typeof event.data['message'] === 'string'
            ? event.data['message']
            : 'Unknown error'
          const code = typeof event.data['code'] === 'string'
            ? event.data['code']
            : undefined
          store.setStreamState({ phase: 'idle', error: { message, code } })
          store.finalizeStreamingMessage()
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection error'
      store.setStreamState({ phase: 'idle', error: { message } })
      store.finalizeStreamingMessage()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, store, approveAction, refreshContext])

  const sendMessage = (text: string, attachments?: import('@/lib/types').ChatAttachment[]): void => {
    if (!transport) {
      console.error('[useAgentChat] No transport — wrap your app with <AgentProvider>')
      return
    }

    const trimmed = text.trim()
    if (!trimmed) return

    lastSubmittedRef.current = trimmed

    store.addUserMessage(trimmed, attachments)
    store.startStreamingMessage()
    store.setStreamState({ phase: 'routing', error: undefined })
    store.setCurrentRequestId(null)
    abortRef.current = false

    void consumeSseStream(transport.sendMessage(trimmed))
  }

  const addLocalUserMessage = useCallback((text: string, attachments?: import('@/lib/types').ChatAttachment[]): void => {
    store.addUserMessage(text, attachments)
  }, [store])

  const startProcessing = useCallback((fileIds?: string[]): void => {
    if (!transport) return

    store.startStreamingMessage()
    store.setStreamState({ phase: 'processing', error: undefined })
    store.setCurrentRequestId(null)
    abortRef.current = false

    void consumeSseStream(transport.processDocuments(fileIds))
  }, [transport, store, consumeSseStream])

  return {
    messages: store.messages,
    streamingMessage: store.streamingMessage,
    streamState: store.streamState,
    input: store.input,
    setInput: store.setInput,
    isStreaming: store.streamState.phase !== 'idle',
    autoApprove: store.autoApprove,
    setAutoApprove: store.setAutoApprove,
    sessionLoaded,
    loadSession,
    sendMessage,
    addLocalUserMessage,
    startProcessing,
    approveAction,
    cancelCurrentRequest,
    retryLastMessage,
    uploadFiles,
    sessionContext: store.sessionContext,
    connected: store.connected,
    lastTurnUsage: store.lastTurnUsage,
    sessionTotalTokens: store.sessionTotalTokens,
  }
}
