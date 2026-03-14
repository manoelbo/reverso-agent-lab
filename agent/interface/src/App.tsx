import { useEffect, useRef, useState, type JSX } from "react"
import { PaperclipIcon, CheckCircleIcon, AlertCircleIcon, XIcon } from "lucide-react"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import { Loader } from "@/components/ai-elements/loader"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input"
import { AssistantMessage } from "@/components/chat/assistant-message"
import { ChatHeader } from "@/components/chat/chat-header"
import type { AgentSessionContext, ChatMessage } from "@/lib/types"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "@/components/ai-elements/context"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from "@/components/ai-elements/attachments"
import { ProcessConfirmation } from "@/components/chat/process-confirmation"
import { AgentProvider } from "@/providers/agent-provider"
import { useAgentChat } from "@/hooks/use-agent-chat"
import { ChatErrorBoundary } from "@/components/chat/error-boundary"
import { TestModeBar } from "@/components/chat/test-mode-bar"

function UserMessage({ message }: { message: ChatMessage }): JSX.Element {
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("")
  return (
    <Message from="user">
      <MessageContent>
        {message.attachments && message.attachments.length > 0 && (
          <Attachments variant="inline" className="mb-1.5">
            {message.attachments.map((att) => (
              <Attachment
                key={att.id}
                data={{
                  type: "file" as const,
                  mediaType: att.mediaType,
                  filename: att.name,
                  url: "",
                  id: att.id,
                }}
              >
                <AttachmentPreview />
                <AttachmentInfo />
              </Attachment>
            ))}
          </Attachments>
        )}
        <MessageResponse>{text}</MessageResponse>
      </MessageContent>
    </Message>
  )
}

interface EmptyStateContent {
  title: string
  description: string
  suggestions: string[]
}

function buildEmptyStateContent(ctx: AgentSessionContext | null): EmptyStateContent {
  if (!ctx) {
    return {
      title: "Reverso Agent",
      description: "Agente de investigação jornalística (OSINT).",
      suggestions: ["oi", "Como funciona o Reverso?"],
    }
  }

  if (ctx.sourceEmpty || ctx.isFirstVisit) {
    return {
      title: "Bem-vindo ao Reverso",
      description: "Adicione documentos (PDFs, contratos, relatórios) para começar a investigação.",
      suggestions: [
        "Como adiciono documentos?",
        "Como funciona o Reverso?",
        "O que é investigação OSINT?",
      ],
    }
  }

  if (ctx.unprocessedCount > 0) {
    return {
      title: "Reverso Agent",
      description: `Há ${ctx.unprocessedCount} documento(s) prontos para processar.`,
      suggestions: [
        "Processar documentos pendentes",
        "O que é o deep-dive?",
        "Como funciona o Reverso?",
      ],
    }
  }

  if (ctx.hasPreviewsWithoutInit) {
    return {
      title: "Reverso Agent",
      description: "Documentos processados. Configure o contexto de investigação para começar.",
      suggestions: [
        "Inicializar contexto de investigação",
        "Ver documentos disponíveis",
        "O que é o deep-dive?",
      ],
    }
  }

  if (ctx.leadsCount > 0) {
    return {
      title: "Reverso Agent",
      description: `Investigação ativa — ${ctx.leadsCount} lead(s) registrado(s).`,
      suggestions: [
        "Fazer deep-dive",
        "Ver leads existentes",
        "Criar lead de investigação",
      ],
    }
  }

  return {
    title: "Reverso Agent",
    description: "Pronto para investigar. Inicie um deep-dive nas suas fontes.",
    suggestions: [
      "Fazer deep-dive",
      "O que são os leads?",
      "Ver fontes processadas",
    ],
  }
}

interface UploadFeedback {
  accepted: string[]
  rejected: Array<{ name: string; reason: string }>
}

function FileAttachmentPreview({
  files,
  onRemove,
}: {
  files: File[]
  onRemove: (index: number) => void
}): JSX.Element | null {
  if (files.length === 0) return null
  return (
    <div className="px-3 pt-2">
      <Attachments variant="inline">
        {files.map((file, i) => (
          <Attachment
            key={`${file.name}-${i}`}
            data={{
              type: "file" as const,
              mediaType: file.type || "application/pdf",
              filename: file.name,
              url: "",
              id: `upload-${i}`,
            }}
            onRemove={() => onRemove(i)}
          >
            <AttachmentPreview />
            <AttachmentInfo />
            <AttachmentRemove label={`Remover ${file.name}`} />
          </Attachment>
        ))}
      </Attachments>
    </div>
  )
}

function UploadFeedbackBanner({ feedback, onDismiss }: { feedback: UploadFeedback; onDismiss: () => void }): JSX.Element {
  return (
    <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex-1 space-y-0.5">
        {feedback.accepted.length > 0 && (
          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
            <span>{feedback.accepted.length} arquivo(s) enviado(s): {feedback.accepted.join(", ")}</span>
          </div>
        )}
        {feedback.rejected.length > 0 && (
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
            <span>
              {feedback.rejected.map((r) => `${r.name} (${r.reason})`).join(", ")}
            </span>
          </div>
        )}
      </div>
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ChatShell(): JSX.Element {
  const {
    messages,
    streamingMessage,
    streamState,
    input,
    setInput,
    sendMessage,
    addLocalUserMessage,
    startProcessing,
    isStreaming,
    autoApprove,
    setAutoApprove,
    approveAction,
    cancelCurrentRequest,
    retryLastMessage,
    uploadFiles,
    sessionLoaded,
    loadSession,
    sessionContext,
    connected,
    lastTurnUsage,
    sessionTotalTokens,
  } = useAgentChat()

  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [uploadFeedback, setUploadFeedback] = useState<UploadFeedback | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pendingProcessFiles, setPendingProcessFiles] = useState<string[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setAttachedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name))
      const newFiles = files.filter((f) => !existing.has(f.name))
      return [...prev, ...newFiles]
    })
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  const handleRemoveFile = (index: number): void => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleConfirmProcessing = (): void => {
    setPendingProcessFiles(null)
    startProcessing()
  }

  const handleSubmit = (message: PromptInputMessage): void => {
    if (isStreaming) return

    const text = (message.text || input).trim()

    if (attachedFiles.length > 0) {
      setIsUploading(true)
      const filesToUpload = [...attachedFiles]
      const fileNames = filesToUpload.map((f) => f.name)
      setAttachedFiles([])

      const attachments = filesToUpload.map((f, i) => ({
        id: `att-${i}-${f.name}`,
        name: f.name,
        mediaType: f.type || 'application/pdf',
      }))

      const userText = text || `Adicionei ${fileNames.length} documento(s) para processar.`
      addLocalUserMessage(userText, attachments)

      void uploadFiles(filesToUpload)
        .then((result) => {
          setIsUploading(false)
          const fb: UploadFeedback = {
            accepted: result.accepted,
            rejected: result.rejected.map((name) => ({
              name,
              reason: result.reasons[name] ?? 'Rejeitado',
            })),
          }
          setUploadFeedback(fb)

          if (result.accepted.length > 0) {
            setPendingProcessFiles(result.accepted)
          }
        })
        .catch((err: unknown) => {
          setIsUploading(false)
          const errorMsg = err instanceof Error ? err.message : 'Erro no upload'
          setUploadFeedback({ accepted: [], rejected: [{ name: 'Upload', reason: errorMsg }] })
        })
      return
    }

    if (!text) return
    sendMessage(text)
  }

  const handleSuggestionClick = (suggestion: string): void => {
    setInput(suggestion)
  }

  const handleSuggestionSend = (text: string): void => {
    if (!isStreaming) sendMessage(text)
  }

  const hasMessages = messages.length > 0 || streamingMessage !== null
  const emptyState = buildEmptyStateContent(sessionContext)
  // During streaming the button acts as stop (via onStop) — never disabled in that state
  const isSubmitDisabled = !isStreaming && !input.trim() && attachedFiles.length === 0

  if (!sessionLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col">
      <ChatHeader
        sessionContext={sessionContext}
        connected={connected}
        autoApprove={autoApprove}
        onAutoApproveChange={setAutoApprove}
      />

      {sessionContext?.testMode && <TestModeBar />}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
        aria-label="Selecionar arquivos PDF"
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Conversation>
          <ConversationContent>
            {!hasMessages ? (
              <ConversationEmptyState>
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="space-y-1.5">
                    <h2 className="font-semibold text-xl tracking-tight">
                      {emptyState.title}
                    </h2>
                    <p className="text-muted-foreground text-sm">
                      {emptyState.description}
                    </p>
                  </div>
                  <Suggestions>
                    {emptyState.suggestions.map((suggestion) => (
                      <Suggestion
                        key={suggestion}
                        onClick={handleSuggestionClick}
                        suggestion={suggestion}
                      />
                    ))}
                  </Suggestions>
                </div>
              </ConversationEmptyState>
            ) : (
              <>
                {/* Finalized messages — stable, never re-renders during streaming [ref:cline] */}
                {messages.map((message) =>
                  message.role === "user" ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      isStreaming={false}
                      onApprove={(id) => approveAction(id, true)}
                      onReject={(id) => approveAction(id, false)}
                      onSuggestionSelect={handleSuggestionSend}
                    />
                  )
                )}

                {/* Streaming message — isolated, re-renders on every SSE chunk [ref:cline] */}
                {streamingMessage !== null && (
                  <AssistantMessage
                    message={streamingMessage}
                    isStreaming={isStreaming}
                    streamPhase={streamState.phase}
                    onApprove={(id) => approveAction(id, true)}
                    onReject={(id) => approveAction(id, false)}
                    onCancelQueue={cancelCurrentRequest}
                    onRetryNow={retryLastMessage}
                    onSuggestionSelect={handleSuggestionSend}
                  />
                )}
              </>
            )}

                {/* Confirmation card after upload — before processing starts */}
                {pendingProcessFiles && pendingProcessFiles.length > 0 && !isStreaming && (
                  <Message from="assistant">
                    <MessageContent>
                      <ProcessConfirmation
                        files={pendingProcessFiles}
                        onConfirm={handleConfirmProcessing}
                        disabled={isStreaming}
                      />
                    </MessageContent>
                  </Message>
                )}

                {/* Show Loader while routing (before text starts arriving) */}
            {streamState.phase === "routing" && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t px-4 py-3">
          {uploadFeedback && (
            <UploadFeedbackBanner
              feedback={uploadFeedback}
              onDismiss={() => setUploadFeedback(null)}
            />
          )}
          <PromptInput onSubmit={handleSubmit}>
            {attachedFiles.length > 0 && (
              <FileAttachmentPreview files={attachedFiles} onRemove={handleRemoveFile} />
            )}
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Plan, @ for context, / for commands — or drag PDF here"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const files = Array.from(e.dataTransfer.files).filter(
                    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
                  )
                  if (files.length === 0) return
                  setAttachedFiles((prev) => {
                    const existing = new Set(prev.map((f) => f.name))
                    return [...prev, ...files.filter((f) => !existing.has(f.name))]
                  })
                }}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || isUploading}
                  title="Anexar PDFs"
                >
                  <PaperclipIcon className="h-4 w-4" />
                </Button>
              </PromptInputTools>
              <PromptInputTools className="ml-auto">
                <Context
                  maxTokens={128_000}
                  usage={lastTurnUsage as never}
                  usedTokens={sessionTotalTokens}
                  modelId={sessionContext?.model}
                >
                  <ContextTrigger />
                  <ContextContent>
                    <ContextContentHeader />
                    <ContextContentBody>
                      <ContextInputUsage />
                      <ContextOutputUsage />
                      <ContextReasoningUsage />
                      <ContextCacheUsage />
                    </ContextContentBody>
                    <ContextContentFooter />
                  </ContextContent>
                </Context>
              </PromptInputTools>
              <PromptInputSubmit
                status={isUploading ? "submitted" : isStreaming ? "streaming" : "ready"}
                disabled={isSubmitDisabled}
                onStop={cancelCurrentRequest}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <AgentProvider>
      <TooltipProvider>
        <ChatErrorBoundary>
          <ChatShell />
        </ChatErrorBoundary>
      </TooltipProvider>
    </AgentProvider>
  )
}
