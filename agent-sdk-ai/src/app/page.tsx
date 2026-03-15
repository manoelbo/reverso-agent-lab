'use client'

import { useMemo, useState, useCallback } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from 'ai'
import type { ReversoUIMessage } from '@/types/ui-message'
import { parseInquiryPanelData } from '@/lib/inquiry-output'

// AI Elements
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from '@/components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '@/components/ai-elements/reasoning'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { Loader } from '@/components/ai-elements/loader'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ai-elements/prompt-input'

// Chat components (using AI Elements internally)
import { QueueProgress } from '@/components/chat/queue-progress'
import { ToolCallDisplay } from '@/components/chat/tool-call-display'
import { SourcesDisplay } from '@/components/chat/sources-display'
import { LeadCard } from '@/components/chat/lead-card'
import { AllegationDisplay } from '@/components/chat/allegation-display'

// UI primitives
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

// Icons
import {
  FileTextIcon,
  BrainIcon,
  FolderOpenIcon,
  SendIcon,
} from 'lucide-react'

// ── Type guards for custom data parts ──────────────────────────────────

interface WorkflowDataPart {
  type: 'data-workflow'
  data: {
    phase: 'preflight' | 'execution' | 'summary'
    message: string
  }
}

interface QueueDataPart {
  type: 'data-queue'
  data: {
    steps: string[]
    currentStep: number
    totalSteps: number
  }
}

interface SuggestionDataPart {
  type: 'data-suggestion'
  data: {
    title: string
    action: string
  }
}

interface SourceStateDataPart {
  type: 'data-sourceState'
  data: {
    sourceEmpty: boolean
    processed: number
    pending: number
    failed: number
  }
}

function isWorkflowPart(part: unknown): part is WorkflowDataPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'data-workflow' &&
    typeof (part as { data?: { message?: unknown } }).data?.message === 'string'
  )
}

function isQueuePart(part: unknown): part is QueueDataPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'data-queue' &&
    Array.isArray((part as { data?: { steps?: unknown } }).data?.steps)
  )
}

function isSuggestionPart(part: unknown): part is SuggestionDataPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'data-suggestion' &&
    typeof (part as { data?: { action?: unknown } }).data?.action === 'string'
  )
}

function isSourceStatePart(part: unknown): part is SourceStateDataPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    (part as { type?: unknown }).type === 'data-sourceState' &&
    typeof (part as { data?: { sourceEmpty?: unknown } }).data?.sourceEmpty === 'boolean'
  )
}

// ── Main page ──────────────────────────────────────────────────────────

export default function HomePage() {
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploadInfo, setUploadInfo] = useState<string>('')
  const [autoAccept, setAutoAccept] = useState(false)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { autoAccept },
      }),
    [autoAccept]
  )

  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    addToolApprovalResponse,
  } = useChat<ReversoUIMessage>({
    transport,
    sendAutomaticallyWhen: (options) =>
      lastAssistantMessageIsCompleteWithToolCalls(options) ||
      lastAssistantMessageIsCompleteWithApprovalResponses(options),
  })

  const handleUpload = useCallback(async (): Promise<string> => {
    if (!files || files.length === 0) return ''

    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append('files', file)
    }

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    const payload = (await response.json()) as {
      accepted: string[]
      rejected: Array<{ fileName: string; reason: string }>
    }

    const summary = [
      payload.accepted.length > 0
        ? `${payload.accepted.length} arquivo(s) aceito(s): ${payload.accepted.join(', ')}`
        : 'Nenhum arquivo aceito.',
      payload.rejected.length > 0
        ? `Rejeitados: ${payload.rejected.map((r) => `${r.fileName} (${r.reason})`).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' ')

    setUploadInfo(summary)
    return summary
  }, [files])

  const handleSubmit = useCallback(
    async (message: { text: string }) => {
      if (status !== 'ready') return

      let uploadSummary = ''
      if (files && files.length > 0) {
        uploadSummary = await handleUpload()
        setFiles(null)
      }

      const normalizedInput = message.text.trim()
      const textToSend =
        normalizedInput ||
        (uploadSummary
          ? `Acabei de enviar arquivos PDF. ${uploadSummary}. Siga o workflow investigativo.`
          : '')

      if (!textToSend) return

      await sendMessage({ text: textToSend })
    },
    [status, files, handleUpload, sendMessage]
  )

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (status !== 'ready') return
      void sendMessage({ text: suggestion })
    },
    [status, sendMessage]
  )

  const isLoading = status === 'submitted' || status === 'streaming'

  return (
    <div className="flex h-screen flex-col">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <BrainIcon className="size-5 text-primary" />
          <h1 className="text-base font-semibold">Reverso</h1>
          <Badge variant="secondary" className="text-xs">AI SDK</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="auto-accept"
            checked={autoAccept}
            onCheckedChange={setAutoAccept}
          />
          <Label htmlFor="auto-accept" className="cursor-pointer text-xs text-muted-foreground">
            Auto-accept
          </Label>
        </div>
      </header>

      {/* ── Conversation ── */}
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<FolderOpenIcon className="size-8" />}
              title="Bem-vindo ao Reverso"
              description="Envie uma mensagem ou PDFs para iniciar a investigação."
            >
              <div className="mt-4">
                <Suggestions>
                  <Suggestion suggestion="Olá" onClick={handleSuggestionClick} />
                  <Suggestion suggestion="Quero fazer um deep-dive" onClick={handleSuggestionClick} />
                  <Suggestion suggestion="Mostra meus leads" onClick={handleSuggestionClick} />
                </Suggestions>
              </div>
            </ConversationEmptyState>
          ) : null}

          {messages.map((message) => (
            <Message key={message.id} from={message.role}>
              {/* ── Intent badge for assistant ── */}
              {message.role === 'assistant' && message.metadata?.intent ? (
                <Badge variant="outline" className="w-fit text-xs">
                  {message.metadata.intent}
                </Badge>
              ) : null}

              {/* ── Render parts ── */}
              {message.parts.map((part, idx) => {
                // Text
                if (isTextUIPart(part)) {
                  return (
                    <MessageContent key={idx}>
                      <MessageResponse>{part.text}</MessageResponse>
                    </MessageContent>
                  )
                }

                // Reasoning
                if (isReasoningUIPart(part)) {
                  return (
                    <Reasoning key={idx} isStreaming={status === 'streaming'}>
                      <ReasoningTrigger />
                      <ReasoningContent>{part.text}</ReasoningContent>
                    </Reasoning>
                  )
                }

                // Tool call
                if (isToolUIPart(part)) {
                  const toolName = part.type.replace('tool-', '')

                  return (
                    <div key={idx} className="space-y-3">
                      <ToolCallDisplay
                        toolName={toolName}
                        state={part.state}
                        input={part.input}
                        output={part.state === 'output-available' ? part.output : undefined}
                        errorText={part.state === 'output-error' ? part.errorText : undefined}
                      />

                      {/* Approval request */}
                      {part.state === 'approval-requested' ? (
                        <Confirmation
                          approval={part.approval}
                          state="approval-requested"
                        >
                          <ConfirmationTitle>
                            <ConfirmationRequest>
                              <p>
                                A ferramenta <strong>{toolName}</strong> precisa de sua aprovação para executar.
                              </p>
                            </ConfirmationRequest>
                          </ConfirmationTitle>
                          <ConfirmationActions>
                            <ConfirmationAction
                              variant="default"
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval.id,
                                  approved: true,
                                })
                              }
                            >
                              Aprovar
                            </ConfirmationAction>
                            <ConfirmationAction
                              variant="destructive"
                              onClick={() =>
                                addToolApprovalResponse({
                                  id: part.approval.id,
                                  approved: false,
                                  reason: 'Operação negada pelo usuário.',
                                })
                              }
                            >
                              Negar
                            </ConfirmationAction>
                          </ConfirmationActions>
                        </Confirmation>
                      ) : null}

                      {/* Approval denied */}
                      {part.state === 'output-denied' ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                          Execução negada. Motivo: {part.approval.reason ?? 'Sem motivo informado.'}
                        </div>
                      ) : null}

                      {/* Deep dive leads */}
                      {part.state === 'output-available' &&
                      toolName === 'deepDive' &&
                      Array.isArray((part.output as { topLeads?: unknown[] })?.topLeads) ? (
                        <div className="space-y-2">
                          {((part.output as { topLeads: unknown[] }).topLeads ?? []).map(
                            (lead, leadIndex) => {
                              if (typeof lead !== 'string') return null
                              return (
                                <LeadCard
                                  key={`${leadIndex}-${lead}`}
                                  title={lead}
                                  onInvestigate={() => {
                                    void sendMessage({
                                      text: `Investigue o lead: ${lead}`,
                                    })
                                  }}
                                  onReject={() => {
                                    void sendMessage({
                                      text: `Rejeitar lead sugerido: ${lead}`,
                                    })
                                  }}
                                />
                              )
                            }
                          )}
                        </div>
                      ) : null}

                      {/* Inquiry results */}
                      {part.state === 'output-available' &&
                      toolName === 'runInquiry' &&
                      parseInquiryPanelData(part.output) ? (
                        (() => {
                          const panelData = parseInquiryPanelData(part.output)
                          if (!panelData) return null
                          const leadSlug = panelData.lead

                          return (
                            <AllegationDisplay
                              lead={leadSlug}
                              verifiedFindings={panelData.verifiedFindingsCount}
                              reviewQueue={panelData.reviewQueueCount}
                              allegations={panelData.allegations}
                              verifiedItems={panelData.verifiedItems}
                              reviewItems={panelData.reviewItems}
                              onAcceptAllegation={(allegationId) => {
                                void sendMessage({
                                  text: `Aceitar alegação ${allegationId} do lead ${leadSlug}.`,
                                })
                              }}
                              onRejectAllegation={(allegationId) => {
                                void sendMessage({
                                  text: `Recusar alegação ${allegationId} do lead ${leadSlug}.`,
                                })
                              }}
                              onVerifyFinding={(findingId) => {
                                void sendMessage({
                                  text: `Verificar finding ${findingId} do lead ${leadSlug}.`,
                                })
                              }}
                              onRejectFinding={(findingId) => {
                                void sendMessage({
                                  text: `Rejeitar finding ${findingId} do lead ${leadSlug}.`,
                                })
                              }}
                            />
                          )
                        })()
                      ) : null}

                      {/* Quick research sources */}
                      {part.state === 'output-available' &&
                      toolName === 'quickResearch' &&
                      Array.isArray((part.output as { sources?: unknown[] })?.sources) ? (
                        <SourcesDisplay
                          sources={
                            ((part.output as { sources: Array<{ docId?: string; fileName?: string }> }).sources ?? []).map((s) => ({
                              id: s.docId,
                              title: s.fileName,
                            }))
                          }
                        />
                      ) : null}
                    </div>
                  )
                }

                // Workflow phase
                if (isWorkflowPart(part)) {
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-sm"
                    >
                      <Badge variant="secondary" className="text-xs">
                        {part.data.phase}
                      </Badge>
                      <span className="text-muted-foreground">{part.data.message}</span>
                    </div>
                  )
                }

                // Queue progress
                if (isQueuePart(part)) {
                  return (
                    <QueueProgress
                      key={idx}
                      steps={part.data.steps}
                      currentStep={part.data.currentStep}
                      totalSteps={part.data.totalSteps}
                    />
                  )
                }

                // Suggestions
                if (isSuggestionPart(part)) {
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{part.data.title}:</span>
                      <span className="text-muted-foreground">{part.data.action}</span>
                    </div>
                  )
                }

                // Source state
                if (isSourceStatePart(part)) {
                  return (
                    <div
                      key={idx}
                      className="rounded-md border px-3 py-2.5 space-y-1"
                    >
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileTextIcon className="size-4 text-muted-foreground" />
                        Estado da Source
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {part.data.sourceEmpty
                          ? 'Sem PDFs na source.'
                          : 'PDFs detectados na source.'}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Processados: {part.data.processed}</span>
                        <span>Pendentes: {part.data.pending}</span>
                        <span>Falhas: {part.data.failed}</span>
                      </div>
                    </div>
                  )
                }

                // Source references (from sendSources)
                if ((part as { type?: string }).type?.startsWith('source')) {
                  const source = part as unknown as { title?: string; url?: string; id?: string }
                  return (
                    <SourcesDisplay
                      key={idx}
                      sources={[{
                        title: source.title,
                        url: source.url,
                        id: source.id,
                      }]}
                    />
                  )
                }

                // Unhandled part
                const unhandledType =
                  typeof (part as { type?: unknown }).type === 'string'
                    ? ((part as { type: string }).type as string)
                    : 'desconhecido'
                return (
                  <div key={idx} className="text-xs text-muted-foreground">
                    Parte não renderizada: {unhandledType}
                  </div>
                )
              })}
            </Message>
          ))}

          {/* Loading indicator */}
          {isLoading && messages.length > 0 ? (
            <Message from="assistant">
              <MessageContent>
                <Loader />
              </MessageContent>
            </Message>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ── Input area ── */}
      <div className="border-t px-4 py-3">
        {uploadInfo ? (
          <div className="mb-2 rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-1.5 text-xs text-blue-400">
            {uploadInfo}
          </div>
        ) : null}
        {error ? (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
            {error.message}
          </div>
        ) : null}

        <PromptInput
          onSubmit={(message) => void handleSubmit(message)}
          accept="application/pdf"
          multiple
        >
          <PromptInputTextarea
            placeholder="Peça deep-dive, inquiry, quick research ou consulte dados..."
          />
          <PromptInputFooter>
            <PromptInputTools>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="file"
                  multiple
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setFiles(e.target.files)}
                />
                <FileTextIcon className="size-3.5" />
                PDF
              </label>
              {files && files.length > 0 ? (
                <Badge variant="outline" className="text-xs">
                  {files.length} arquivo(s)
                </Badge>
              ) : null}
            </PromptInputTools>
            <PromptInputSubmit
              status={status}
              onStop={() => stop()}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
