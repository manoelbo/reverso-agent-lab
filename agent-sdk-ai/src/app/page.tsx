'use client'

import { FormEvent, useMemo, useState } from 'react'
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
import { QueueProgress } from '@/components/chat/queue-progress'
import { ToolCallDisplay } from '@/components/chat/tool-call-display'
import { SourcesDisplay } from '@/components/chat/sources-display'
import { LeadCard } from '@/components/chat/lead-card'
import { AllegationDisplay } from '@/components/chat/allegation-display'

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

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

function renderToolStateLabel(state: string): string {
  switch (state) {
    case 'input-streaming':
      return 'recebendo input'
    case 'input-available':
      return 'input pronto'
    case 'approval-requested':
      return 'aguardando aprovação'
    case 'approval-responded':
      return 'aprovação respondida'
    case 'output-available':
      return 'concluído'
    case 'output-error':
      return 'erro'
    case 'output-denied':
      return 'negado'
    default:
      return state
  }
}

export default function HomePage() {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploadInfo, setUploadInfo] = useState<string>('')
  const [autoAccept, setAutoAccept] = useState(false)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: {
          autoAccept,
        },
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

  const handleUpload = async (): Promise<string> => {
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
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status !== 'ready') return

    let uploadSummary = ''
    if (files && files.length > 0) {
      uploadSummary = await handleUpload()
      setFiles(null)
    }

    const normalizedInput = input.trim()
    const textToSend =
      normalizedInput ||
      (uploadSummary
        ? `Acabei de enviar arquivos PDF. ${uploadSummary}. Siga o workflow investigativo.`
        : '')

    if (!textToSend) return

    await sendMessage({
      text: textToSend,
    })
    setInput('')
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: 20,
        display: 'grid',
        gap: 12,
      }}
    >
      <header
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <h1 style={{ margin: 0 }}>Reverso (AI SDK)</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
          Workflow state-aware, tools nativas, approvals e processamento externo de PDFs.
        </p>
        <label style={{ display: 'inline-flex', gap: 8, marginTop: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoAccept}
            onChange={(event) => setAutoAccept(event.target.checked)}
          />
          Auto-accept de ações sensíveis
        </label>
      </header>

      <section
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
          minHeight: 420,
          overflow: 'auto',
        }}
      >
        {messages.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>
            Envie uma mensagem (ou PDFs) para iniciar a investigação.
          </p>
        ) : null}

        {messages.map((message) => (
          <article key={message.id} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 600,
                marginBottom: 8,
                color: message.role === 'user' ? '#8db9ff' : '#f0f3f7',
              }}
            >
              {message.role === 'user' ? 'Você' : 'Reverso'}
              {message.role === 'assistant' && message.metadata?.intent ? (
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontWeight: 500 }}>
                  (intent: {message.metadata.intent})
                </span>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {message.parts.map((part, idx) => {
                if (isTextUIPart(part)) {
                  return (
                    <div
                      key={idx}
                      style={{
                        whiteSpace: 'pre-wrap',
                        background: '#11141a',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 10,
                      }}
                    >
                      {part.text}
                    </div>
                  )
                }

                if (isReasoningUIPart(part)) {
                  return (
                    <details
                      key={idx}
                      style={{
                        background: '#12151c',
                        border: '1px dashed var(--border)',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <summary style={{ cursor: 'pointer' }}>Raciocínio do modelo</summary>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{part.text}</pre>
                    </details>
                  )
                }

                if (isToolUIPart(part)) {
                  const toolName = part.type.replace('tool-', '')
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#11141a',
                        border: '1px solid #2a3140',
                        borderRadius: 8,
                        padding: 10,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <ToolCallDisplay
                        toolName={toolName}
                        stateLabel={renderToolStateLabel(part.state)}
                        input={part.input}
                        output={part.state === 'output-available' ? part.output : undefined}
                        errorText={part.state === 'output-error' ? part.errorText : undefined}
                      />

                      {part.state === 'approval-requested' ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() =>
                              addToolApprovalResponse({
                                id: part.approval.id,
                                approved: true,
                              })
                            }
                            style={{
                              borderRadius: 8,
                              border: '1px solid #2d8756',
                              background: '#1f6b45',
                              color: 'white',
                              padding: '6px 10px',
                              cursor: 'pointer',
                            }}
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              addToolApprovalResponse({
                                id: part.approval.id,
                                approved: false,
                                reason: 'Operação negada pelo usuário.',
                              })
                            }
                            style={{
                              borderRadius: 8,
                              border: '1px solid #9d4343',
                              background: '#7f3232',
                              color: 'white',
                              padding: '6px 10px',
                              cursor: 'pointer',
                            }}
                          >
                            Negar
                          </button>
                        </div>
                      ) : null}

                      {part.state === 'output-denied' ? (
                        <div style={{ color: '#efaaaa' }}>
                          Execução negada. Motivo: {part.approval.reason ?? 'Sem motivo informado.'}
                        </div>
                      ) : null}

                      {part.state === 'output-available' &&
                      toolName === 'deepDive' &&
                      Array.isArray((part.output as { topLeads?: unknown[] })?.topLeads) ? (
                        <div style={{ display: 'grid', gap: 8 }}>
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

                      {part.state === 'output-available' &&
                      toolName === 'runInquiry' &&
                      typeof (part.output as { lead?: unknown; evidenceGate?: unknown })
                        ?.evidenceGate === 'object' &&
                      (part.output as { evidenceGate: { verifiedFindings?: number; reviewQueue?: number } })
                        .evidenceGate !== null ? (
                        <AllegationDisplay
                          lead={
                            typeof (part.output as { lead?: unknown }).lead === 'string'
                              ? (part.output as { lead: string }).lead
                              : 'lead'
                          }
                          verifiedFindings={
                            (part.output as {
                              evidenceGate: { verifiedFindings?: number }
                            }).evidenceGate.verifiedFindings ?? 0
                          }
                          reviewQueue={
                            (part.output as {
                              evidenceGate: { reviewQueue?: number }
                            }).evidenceGate.reviewQueue ?? 0
                          }
                        />
                      ) : null}
                    </div>
                  )
                }

                if (isWorkflowPart(part)) {
                  return (
                    <div
                      key={idx}
                      style={{
                        background: '#0f2331',
                        border: '1px solid #2e526f',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <strong>Workflow</strong>: {part.data.phase} — {part.data.message}
                    </div>
                  )
                }

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

                if (isSuggestionPart(part)) {
                    return (
                      <div
                        key={idx}
                        style={{
                        background: '#121825',
                        border: '1px solid #2c3b56',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <strong>{part.data.title}</strong>: {part.data.action}
                    </div>
                  )
                }

                if (part.type.startsWith('source')) {
                  return <SourcesDisplay key={idx} source={part} />
                }

                const unhandledType =
                  typeof (part as { type?: unknown }).type === 'string'
                    ? ((part as { type: string }).type as string)
                    : 'desconhecido'

                return (
                  <div key={idx} style={{ color: 'var(--muted)' }}>
                    Parte não renderizada: {unhandledType}
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </section>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: 10,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 14,
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Peça deep-dive, inquiry, quick research ou consulte dados..."
          rows={4}
          style={{
            width: '100%',
            resize: 'vertical',
            background: '#10131a',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
          }}
        />

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="file"
            multiple
            accept="application/pdf"
            onChange={(event) => setFiles(event.target.files)}
          />
          <button
            type="submit"
            disabled={status !== 'ready'}
            style={{
              borderRadius: 8,
              border: '1px solid #316aa8',
              background: '#24598f',
              color: 'white',
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            Enviar
          </button>
          <button
            type="button"
            onClick={() => stop()}
            style={{
              borderRadius: 8,
              border: '1px solid #5a6376',
              background: '#3d4453',
              color: 'white',
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            Interromper stream
          </button>
          <span style={{ color: 'var(--muted)' }}>status: {status}</span>
        </div>

        {uploadInfo ? <div style={{ color: '#9dc6ff' }}>{uploadInfo}</div> : null}
        {error ? <div style={{ color: 'var(--danger)' }}>{error.message}</div> : null}
      </form>
    </main>
  )
}
