import type { AgentEvent, AgentSessionContext, PersistedMessage } from './types'
import { parseSseResponse } from './sse-parser'

export interface UploadResult {
  accepted: string[]
  rejected: string[]
  reasons: Record<string, string>
}

export interface LeadActionResult {
  ok: boolean
  message: string
  allRejected?: boolean
  suggestions?: Array<{ id: string; text: string }>
}

export interface AllegationActionResult {
  ok: boolean
  message: string
}

export interface FindingActionResult {
  ok: boolean
  message: string
}

export interface AgentTransport {
  sendMessage(text: string): AsyncIterable<AgentEvent>
  processDocuments(fileIds?: string[]): AsyncIterable<AgentEvent>
  sendApproval(requestId: string, approved: boolean): Promise<void>
  cancelRequest(requestId: string): Promise<void>
  getSession(): Promise<PersistedMessage[]>
  getAgentContext(): Promise<AgentSessionContext>
  resetTest(mode: 'chat' | 'investigation' | 'sources-artefacts' | 'all'): Promise<{ ok: boolean; message: string }>
  uploadFiles(files: File[]): Promise<UploadResult>
  leadAction(slug: string, action: 'accept' | 'reject'): Promise<LeadActionResult>
  allegationAction(id: string, action: 'accept' | 'reject', leadSlug: string): Promise<AllegationActionResult>
  findingAction(id: string, action: 'verify' | 'reject'): Promise<FindingActionResult>
}

const DEFAULT_BASE_URL = 'http://localhost:3210'

export class HttpAgentTransport implements AgentTransport {
  private baseUrl: string

  constructor(baseUrl = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl
  }

  async *sendMessage(text: string): AsyncIterable<AgentEvent> {
    const MAX_ATTEMPTS = 3
    let attempt = 0

    while (attempt < MAX_ATTEMPTS) {
      try {
        const response = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })

        let gotDone = false
        for await (const event of parseSseResponse(response)) {
          if (event.type === 'done') gotDone = true
          yield event
        }

        // Stream completou normalmente com evento done
        if (gotDone) return

        // Stream encerrou sem done — pode ser drop de rede
        attempt++
        if (attempt >= MAX_ATTEMPTS) return

        // Backoff exponencial: 2s, 4s, 8s
        const delaySec = Math.pow(2, attempt)
        await new Promise<void>((resolve) => setTimeout(resolve, delaySec * 1000))
      } catch (err) {
        attempt++
        if (attempt >= MAX_ATTEMPTS) throw err

        // Backoff exponencial antes de retentar
        const delaySec = Math.pow(2, attempt)
        await new Promise<void>((resolve) => setTimeout(resolve, delaySec * 1000))
      }
    }
  }

  async *processDocuments(fileIds?: string[]): AsyncIterable<AgentEvent> {
    const response = await fetch(`${this.baseUrl}/api/process-documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: fileIds ?? [] }),
    })

    for await (const event of parseSseResponse(response)) {
      yield event
    }
  }

  async sendApproval(requestId: string, approved: boolean): Promise<void> {
    await fetch(`${this.baseUrl}/api/approval/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
    })
  }

  async cancelRequest(requestId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    })
  }

  async getSession(): Promise<PersistedMessage[]> {
    const response = await fetch(`${this.baseUrl}/api/session`)
    if (!response.ok) return []
    const data = (await response.json()) as { messages?: PersistedMessage[] }
    return data.messages ?? []
  }

  async getAgentContext(): Promise<AgentSessionContext> {
    const response = await fetch(`${this.baseUrl}/api/context`)
    if (!response.ok) throw new Error('Failed to load agent context')
    return (await response.json()) as AgentSessionContext
  }

  async resetTest(mode: 'chat' | 'investigation' | 'sources-artefacts' | 'all'): Promise<{ ok: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/test/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    const data = (await response.json()) as { ok: boolean; message: string }
    return data
  }

  async uploadFiles(files: File[]): Promise<UploadResult> {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file, file.name)
    }
    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: string }
      throw new Error(err.error ?? `Upload failed: ${response.status}`)
    }
    return (await response.json()) as UploadResult
  }

  async leadAction(slug: string, action: 'accept' | 'reject'): Promise<LeadActionResult> {
    const response = await fetch(`${this.baseUrl}/api/leads/${slug}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: string }
      throw new Error(err.error ?? `Lead action failed: ${response.status}`)
    }
    return (await response.json()) as LeadActionResult
  }

  async allegationAction(id: string, action: 'accept' | 'reject', leadSlug: string): Promise<AllegationActionResult> {
    const response = await fetch(`${this.baseUrl}/api/allegations/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, leadSlug }),
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: string }
      throw new Error(err.error ?? `Allegation action failed: ${response.status}`)
    }
    return (await response.json()) as AllegationActionResult
  }

  async findingAction(id: string, action: 'verify' | 'reject'): Promise<FindingActionResult> {
    const response = await fetch(`${this.baseUrl}/api/findings/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!response.ok) {
      const err = (await response.json()) as { error?: string }
      throw new Error(err.error ?? `Finding action failed: ${response.status}`)
    }
    return (await response.json()) as FindingActionResult
  }
}
