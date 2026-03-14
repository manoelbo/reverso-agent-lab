import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { AgentSessionContext, ChatAttachment, ChatMessage, MessagePartType, PersistedMessage, PlanStep, QueueStep, StreamState, TokenUsage, ToolLifecycle, TraceStep } from '@/lib/types'

// ─── Rich parts localStorage persistence ─────────────────────────────────────

const RICH_PARTS_KEY_PREFIX = 'agent-rich-parts-'

/** Part types worth restoring across page loads */
const RESTORABLE_TYPES = new Set(['artifact', 'lead-suggestion', 'allegation', 'suggestions'])

function richPartsKey(messageId: string): string {
  return `${RICH_PARTS_KEY_PREFIX}${messageId}`
}

function persistMessageParts(messageId: string, parts: MessagePartType[]): void {
  try {
    const rich = parts.filter((p) => RESTORABLE_TYPES.has(p.type))
    if (rich.length === 0) return
    localStorage.setItem(richPartsKey(messageId), JSON.stringify(rich))
  } catch {
    // Non-fatal — storage quota or private mode
  }
}

function loadMessageParts(messageId: string): MessagePartType[] {
  try {
    const raw = localStorage.getItem(richPartsKey(messageId))
    if (!raw) return []
    return JSON.parse(raw) as MessagePartType[]
  } catch {
    return []
  }
}

function clearAllRichParts(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(RICH_PARTS_KEY_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  } catch {
    // Non-fatal
  }
}

interface AgentChatState {
  // Finalized messages — only changes when a turn ends (done event)
  messages: ChatMessage[]

  // The currently streaming assistant message — changes on every SSE chunk
  // Kept separate from messages[] to avoid re-rendering the whole list [ref:cline]
  streamingMessage: ChatMessage | null

  // Granular stream state [ref:void]
  streamState: StreamState

  // Input controlled by the store
  input: string

  // Auto-approve: skip Confirmation UI and approve all gates silently
  autoApprove: boolean

  // Session context from the server (model, stage, leads count)
  sessionContext: AgentSessionContext | null

  // Whether the server is reachable
  connected: boolean

  // Token usage — last turn breakdown and session accumulation
  lastTurnUsage: TokenUsage | null
  sessionTotalTokens: number

  // E3: current request ID for cancel support
  currentRequestId: string | null

  // Actions
  setInput: (value: string) => void

  setAutoApprove: (value: boolean) => void

  setSessionContext: (ctx: AgentSessionContext) => void

  setConnected: (value: boolean) => void

  setTokenUsage: (usage: TokenUsage) => void

  addUserMessage: (text: string, attachments?: ChatAttachment[]) => ChatMessage

  startStreamingMessage: () => void

  updateStreamingText: (fullText: string) => void

  updateStreamingReasoning: (fullText: string) => void

  setStreamingRouteDecision: (decision: {
    intent: string
    route: string
    reason?: string
  }) => void

  addToolCallPart: (toolId: string, toolName: string, input: unknown) => void

  addPlanPart: (planId: string, title: string, steps: PlanStep[]) => void

  updatePlanStep: (planId: string, stepId: string, status: PlanStep['status']) => void

  addSourceReference: (docId: string, page?: number, role?: 'consulted' | 'created', docName?: string) => void

  addConfirmationPart: (requestId: string, title: string, description?: string) => void

  updateConfirmationState: (requestId: string, state: 'approved' | 'rejected') => void

  addTraceStep: (step: TraceStep) => void

  updateTraceStep: (id: string, updates: Partial<TraceStep>) => void

  updateToolLifecycle: (
    toolId: string,
    lifecycle: ToolLifecycle,
    output?: unknown,
    error?: string,
  ) => void

  /** Moves streamingMessage → messages[] and resets to null */
  finalizeStreamingMessage: () => void

  /** Populates messages from a persisted session (replaces current messages) */
  loadPersistedMessages: (persisted: PersistedMessage[]) => void

  setStreamState: (partial: Partial<StreamState>) => void

  // E3: Queue + Retry + Cancel
  setCurrentRequestId: (id: string | null) => void
  startQueuePart: (queueId: string, steps: QueueStep[]) => void
  updateQueueStep: (queueId: string, stepId: string, status: QueueStep['status']) => void
  abortQueue: (queueId: string) => void
  addRetryPart: (attempt: number, maxAttempts: number, delaySec: number, errorSnippet: string) => void
  clearRetryParts: () => void

  // E4: Dynamic Suggestions
  addSuggestionsPart: (items: Array<{ id: string; text: string }>) => void

  // E5/E6: Artifact
  addArtifactPart: (artifact: { title: string; content: string; language?: string; path?: string }) => void

  // E8/E9: Lead Suggestion
  addLeadSuggestionPart: (lead: {
    leadId: string
    slug: string
    title: string
    description: string
    inquiryPlan?: string
    status?: 'draft' | 'planned' | 'rejected'
  }) => void
  updateLeadPartState: (slug: string, actionState: 'pending' | 'accepted' | 'rejected') => void

  // E10: Inquiry Allegations
  addAllegationPart: (allegation: {
    id: string
    title: string
    leadSlug: string
    status: 'pending' | 'accepted' | 'rejected'
    findings: Array<{ id: string; text: string; status: 'unverified' | 'verified' | 'rejected'; sourceRefs?: string[] }>
  }) => void

  /** Clears conversation for test mode reset — keeps sessionContext and connected */
  clearForTest: () => void

  reset: () => void
}

const initialStreamState: StreamState = { phase: 'idle' }

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
  messages: [],
  streamingMessage: null,
  streamState: initialStreamState,
  input: '',
  autoApprove: false,
  sessionContext: null,
  connected: false,
  lastTurnUsage: null,
  sessionTotalTokens: 0,
  currentRequestId: null,

  setInput: (value) => set({ input: value }),

  setAutoApprove: (value) => set({ autoApprove: value }),

  setSessionContext: (ctx) => set({ sessionContext: ctx }),

  setConnected: (value) => set({ connected: value }),

  setTokenUsage: (usage) =>
    set((state) => ({
      lastTurnUsage: usage,
      sessionTotalTokens: state.sessionTotalTokens + usage.totalTokens,
    })),

  addUserMessage: (text, attachments) => {
    const message: ChatMessage = {
      id: nanoid(),
      role: 'user',
      parts: [{ type: 'text', text }],
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      timestamp: new Date().toISOString(),
    }
    set((state) => ({ messages: [...state.messages, message], input: '' }))
    return message
  },

  startStreamingMessage: () => {
    const message: ChatMessage = {
      id: nanoid(),
      role: 'assistant',
      parts: [],
      timestamp: new Date().toISOString(),
    }
    set({ streamingMessage: message })
  },

  updateStreamingText: (fullText) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state

      // Replace or create the text part (substitution, not append) [ref:cline,void]
      const existingTextIdx = msg.parts.findIndex((p) => p.type === 'text')
      const parts =
        existingTextIdx >= 0
          ? msg.parts.map((p, i) =>
              i === existingTextIdx ? { type: 'text' as const, text: fullText } : p,
            )
          : [...msg.parts, { type: 'text' as const, text: fullText }]

      return {
        streamingMessage: { ...msg, parts },
      }
    })
  },

  updateStreamingReasoning: (fullText) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state

      const existingIdx = msg.parts.findIndex((p) => p.type === 'reasoning')
      const parts =
        existingIdx >= 0
          ? msg.parts.map((p, i) =>
              i === existingIdx
                ? { type: 'reasoning' as const, text: fullText }
                : p,
            )
          : [...msg.parts, { type: 'reasoning' as const, text: fullText }]

      return { streamingMessage: { ...msg, parts } }
    })
  },

  setStreamingRouteDecision: (decision) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      return { streamingMessage: { ...msg, routeDecision: decision } }
    })
  },

  addToolCallPart: (toolId, toolName, input) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = {
        type: 'tool-call' as const,
        toolId,
        toolName,
        input,
        lifecycle: 'requested' as ToolLifecycle,
      }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  addPlanPart: (planId, title, steps) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = { type: 'plan' as const, planId, title, steps }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  updatePlanStep: (planId, stepId, status) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const parts = msg.parts.map((p) => {
        if (p.type === 'plan' && p.planId === planId) {
          return {
            ...p,
            steps: p.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
          }
        }
        return p
      })
      return { streamingMessage: { ...msg, parts } }
    })
  },

  addSourceReference: (docId, page, role, docName) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = { type: 'source-reference' as const, docId, page, role, docName }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  addConfirmationPart: (requestId, title, description) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = {
        type: 'confirmation' as const,
        requestId,
        title,
        description,
        state: 'approval-requested' as const,
      }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  updateConfirmationState: (requestId, confirmationState) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const parts = msg.parts.map((p) => {
        if (p.type === 'confirmation' && p.requestId === requestId) {
          return { ...p, state: confirmationState }
        }
        return p
      })
      return { streamingMessage: { ...msg, parts } }
    })
  },

  addTraceStep: (step) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const traceSteps = [...(msg.traceSteps ?? []), step]
      return { streamingMessage: { ...msg, traceSteps } }
    })
  },

  updateTraceStep: (id, updates) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const traceSteps = (msg.traceSteps ?? []).map((s) =>
        s.id === id ? { ...s, ...updates } : s,
      )
      return { streamingMessage: { ...msg, traceSteps } }
    })
  },

  updateToolLifecycle: (toolId, lifecycle, output, error) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state

      const parts = msg.parts.map((p) => {
        if (p.type === 'tool-call' && p.toolId === toolId) {
          return { ...p, lifecycle, output, error }
        }
        return p
      })

      return { streamingMessage: { ...msg, parts } }
    })
  },

  finalizeStreamingMessage: () => {
    set((state) => {
      if (!state.streamingMessage) return state
      persistMessageParts(state.streamingMessage.id, state.streamingMessage.parts)
      return {
        messages: [...state.messages, state.streamingMessage],
        streamingMessage: null,
      }
    })
  },

  setStreamState: (partial) => {
    set((state) => ({
      streamState: { ...state.streamState, ...partial },
    }))
  },

  loadPersistedMessages: (persisted) => {
    const chatMessages: ChatMessage[] = persisted.map((m) => {
      const textPart: MessagePartType = { type: 'text', text: m.text }
      const parts: MessagePartType[] = [textPart]
      // Restore rich parts from localStorage (artifact, lead-suggestion, allegation, suggestions)
      if (m.role === 'assistant') {
        const richParts = loadMessageParts(m.id)
        parts.push(...richParts)
      }
      return { id: m.id, role: m.role, parts, timestamp: m.timestamp }
    })
    set({ messages: chatMessages })
  },

  // ─── E3: Queue + Retry + Cancel ──────────────────────────────────────────

  setCurrentRequestId: (id) => set({ currentRequestId: id }),

  startQueuePart: (queueId, steps) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = {
        type: 'queue' as const,
        queueId,
        steps,
        currentStep: 0,
        aborted: false,
      }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  updateQueueStep: (queueId, stepId, status) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const parts = msg.parts.map((p) => {
        if (p.type === 'queue' && p.queueId === queueId) {
          const updatedSteps = p.steps.map((s) =>
            s.id === stepId ? { ...s, status } : s,
          )
          const currentStep = updatedSteps.findIndex(
            (s) => s.status === 'running' || s.status === 'pending',
          )
          return { ...p, steps: updatedSteps, currentStep: currentStep >= 0 ? currentStep : p.steps.length }
        }
        return p
      })
      return { streamingMessage: { ...msg, parts } }
    })
  },

  abortQueue: (queueId) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const parts = msg.parts.map((p) => {
        if (p.type === 'queue' && p.queueId === queueId) {
          const updatedSteps = p.steps.map((s) =>
            s.status === 'pending' || s.status === 'running'
              ? { ...s, status: 'aborted' as const }
              : s,
          )
          return { ...p, steps: updatedSteps, aborted: true }
        }
        return p
      })
      return { streamingMessage: { ...msg, parts } }
    })
  },

  addRetryPart: (attempt, maxAttempts, delaySec, errorSnippet) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      // Remove any existing retry part and add a fresh one
      const withoutRetry = msg.parts.filter((p) => p.type !== 'retry')
      const newPart = { type: 'retry' as const, attempt, maxAttempts, delaySec, errorSnippet }
      return { streamingMessage: { ...msg, parts: [...withoutRetry, newPart] } }
    })
  },

  clearRetryParts: () => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const parts = msg.parts.filter((p) => p.type !== 'retry')
      return { streamingMessage: { ...msg, parts } }
    })
  },

  // ─── E4: Dynamic Suggestions ─────────────────────────────────────────────

  addSuggestionsPart: (items) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = { type: 'suggestions' as const, items }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  // ─── E5/E6: Artifact ─────────────────────────────────────────────────────

  addArtifactPart: (artifact) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = { type: 'artifact' as const, ...artifact }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  // ─── E8/E9: Lead Suggestion ───────────────────────────────────────────────

  addLeadSuggestionPart: (lead) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = {
        type: 'lead-suggestion' as const,
        ...lead,
        actionState: 'pending' as const,
      }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  updateLeadPartState: (slug, actionState) => {
    // Search in both streamingMessage and finalized messages
    set((state) => {
      const updateParts = (parts: import('@/lib/types').MessagePartType[]) =>
        parts.map((p) =>
          p.type === 'lead-suggestion' && p.slug === slug ? { ...p, actionState } : p,
        )

      const updatedMessages = state.messages.map((m) => ({
        ...m,
        parts: updateParts(m.parts),
      }))

      const streamingMessage = state.streamingMessage
        ? {
            ...state.streamingMessage,
            parts: updateParts(state.streamingMessage.parts),
          }
        : null

      return { messages: updatedMessages, streamingMessage }
    })
  },

  addAllegationPart: (allegation) => {
    set((state) => {
      const msg = state.streamingMessage
      if (!msg) return state
      const newPart = {
        type: 'allegation' as const,
        ...allegation,
      }
      return { streamingMessage: { ...msg, parts: [...msg.parts, newPart] } }
    })
  },

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  clearForTest: () => {
    clearAllRichParts()
    set({
      messages: [],
      streamingMessage: null,
      streamState: initialStreamState,
      input: '',
      lastTurnUsage: null,
      currentRequestId: null,
    })
  },

  reset: () => {
    clearAllRichParts()
    set({
      messages: [],
      streamingMessage: null,
      streamState: initialStreamState,
      input: '',
      autoApprove: false,
      sessionContext: null,
      connected: false,
      lastTurnUsage: null,
      sessionTotalTokens: 0,
      currentRequestId: null,
    })
  },
}))
