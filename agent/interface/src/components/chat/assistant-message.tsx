import type { ChatMessage, MessagePartType, StreamPhase } from "@/lib/types"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { ToolCallDisplay } from "@/components/chat/tool-call-display"
import { PlanDisplay } from "@/components/chat/plan-display"
import { SourcesDisplay } from "@/components/chat/sources-display"
import { ConfirmationDisplay } from "@/components/chat/confirmation-display"
import { ExecutionTrace } from "@/components/chat/execution-trace"
import { QueueProgress } from "@/components/chat/queue-progress"
import { RetryIndicator } from "@/components/chat/retry-indicator"
import { DynamicSuggestions } from "@/components/chat/dynamic-suggestions"
import { ArtifactDisplay } from "@/components/chat/artifact-display"
import { LeadCard } from "@/components/chat/lead-card"
import { AllegationDisplay } from "@/components/chat/allegation-display"
import { ChatErrorBoundary } from "@/components/chat/error-boundary"

const ROUTE_LABELS: Record<string, string> = {
  ask_clarify: "Conversa direta",
  general_chat: "Conversa direta",
  greeting: "Saudação",
  quick_research: "Pesquisa rápida",
  view_data: "Consulta de dados",
  update_agent_context: "Atualização de contexto",
  process_documents: "Processamento de documentos",
  deep_dive: "Análise profunda (deep-dive)",
  deep_dive_next: "Continuando análise ativa",
  init: "Configuração de contexto",
  create_lead: "Criação de lead",
  plan_leads: "Planejamento de leads",
  execute_inquiry: "Execução de inquiry",
  abort: "Cancelar operação",
}

function routeLabel(intent: string): string {
  return ROUTE_LABELS[intent] ?? intent
}

export interface AssistantMessageProps {
  message: ChatMessage
  isStreaming?: boolean
  streamPhase?: StreamPhase
  onApprove?: (requestId: string) => void
  onReject?: (requestId: string) => void
  onCancelQueue?: () => void
  onRetryNow?: () => void
  onSuggestionSelect?: (text: string) => void
}

export function AssistantMessage({
  message,
  isStreaming = false,
  streamPhase,
  onApprove,
  onReject,
  onCancelQueue,
  onRetryNow,
  onSuggestionSelect,
}: AssistantMessageProps) {
  const hasText = message.parts.some(
    (p) => p.type === "text" && p.text.length > 0
  )

  const sourceParts = message.parts.filter(
    (p): p is Extract<MessagePartType, { type: "source-reference" }> =>
      p.type === "source-reference"
  )

  return (
    <Message from="assistant">
      <MessageContent className="w-full">
        {(message.traceSteps?.length ?? 0) > 0 ? (
          <ExecutionTrace steps={message.traceSteps!} isStreaming={isStreaming} />
        ) : message.routeDecision ? (
          // Fallback for persisted messages that predate traceSteps
          <ChainOfThought defaultOpen={false}>
            <ChainOfThoughtHeader />
            <ChainOfThoughtContent>
              <ChainOfThoughtStep
                label={routeLabel(message.routeDecision.intent)}
                description={message.routeDecision.reason}
                status="complete"
              />
            </ChainOfThoughtContent>
          </ChainOfThought>
        ) : null}

        {message.parts.map((part, i) => {
          if (part.type === "reasoning") {
            return (
              <Reasoning key={i} isStreaming={isStreaming}>
                <ReasoningTrigger />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            )
          }
          if (part.type === "text") {
            return (
              <MessageResponse key={i} isAnimating={isStreaming}>
                {part.text}
              </MessageResponse>
            )
          }
          if (part.type === "tool-call") {
            return (
              <ChatErrorBoundary key={part.toolId} inline>
                <ToolCallDisplay part={part} />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "plan") {
            return (
              <ChatErrorBoundary key={part.planId} inline>
                <PlanDisplay part={part} isStreaming={isStreaming} />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "confirmation") {
            return (
              <ChatErrorBoundary key={part.requestId} inline>
                <ConfirmationDisplay
                  part={part}
                  onApprove={() => onApprove?.(part.requestId)}
                  onReject={() => onReject?.(part.requestId)}
                />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "queue") {
            return (
              <ChatErrorBoundary key={part.queueId} inline>
                <QueueProgress
                  queueId={part.queueId}
                  steps={part.steps}
                  currentStep={part.currentStep}
                  aborted={part.aborted}
                  onCancel={isStreaming ? onCancelQueue : undefined}
                />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "retry") {
            return (
              <ChatErrorBoundary key={`retry-${part.attempt}`} inline>
                <RetryIndicator
                  attempt={part.attempt}
                  maxAttempts={part.maxAttempts}
                  delaySec={part.delaySec}
                  errorSnippet={part.errorSnippet}
                  onRetryNow={isStreaming ? onRetryNow : undefined}
                  onCancel={isStreaming ? onCancelQueue : undefined}
                />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "suggestions") {
            return (
              <ChatErrorBoundary key={`suggestions-${i}`} inline>
                <DynamicSuggestions
                  items={part.items}
                  onSelect={onSuggestionSelect ?? (() => {})}
                />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "artifact") {
            return (
              <ChatErrorBoundary key={`artifact-${i}`} inline>
                <ArtifactDisplay part={part} />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "lead-suggestion") {
            return (
              <ChatErrorBoundary key={`lead-${part.slug}-${i}`} inline>
                <LeadCard
                  lead={part}
                  onInvestigate={(slugOrText) => {
                    const text = slugOrText.startsWith("investigar ")
                      ? slugOrText
                      : `investigar ${slugOrText}`
                    onSuggestionSelect?.(text)
                  }}
                />
              </ChatErrorBoundary>
            )
          }
          if (part.type === "allegation") {
            return (
              <ChatErrorBoundary key={`allegation-${part.id}-${i}`} inline>
                <AllegationDisplay part={part} />
              </ChatErrorBoundary>
            )
          }
          return null
        })}

        {sourceParts.length > 0 && <SourcesDisplay parts={sourceParts} />}

        {/* Show shimmer only after routing phase, before text arrives */}
        {isStreaming && !hasText && streamPhase !== "routing" && (
          <Shimmer className="text-sm text-muted-foreground">
            Gerando resposta...
          </Shimmer>
        )}
      </MessageContent>
    </Message>
  )
}
