import type { AgentEvent, AgentSessionContext, PersistedMessage } from './types'
import type { AgentTransport, AllegationActionResult, FindingActionResult, LeadActionResult, UploadResult } from './agent-transport'

/**
 * Stub for Electron IPC transport.
 *
 * When integrating into the Electron app, replace the method bodies with
 * calls through contextBridge / ipcRenderer, e.g.:
 *
 *   sendMessage(text) -> window.api.agentChat(text) returning an AsyncIterable
 *   sendApproval(id, approved) -> window.api.agentApproval(id, approved)
 *   getSession() -> window.api.agentGetSession()
 *   getAgentContext() -> window.api.agentGetContext()
 *
 * The main process would call the runners directly (no HTTP server needed).
 */
export class IpcAgentTransport implements AgentTransport {
  async *sendMessage(_text: string): AsyncIterable<AgentEvent> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async *processDocuments(_fileIds?: string[]): AsyncIterable<AgentEvent> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async sendApproval(_requestId: string, _approved: boolean): Promise<void> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async cancelRequest(_requestId: string): Promise<void> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async getSession(): Promise<PersistedMessage[]> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async getAgentContext(): Promise<AgentSessionContext> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async resetTest(_mode: 'chat' | 'investigation' | 'sources-artefacts' | 'all'): Promise<{ ok: boolean; message: string }> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async uploadFiles(_files: File[]): Promise<UploadResult> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async leadAction(_slug: string, _action: 'accept' | 'reject'): Promise<LeadActionResult> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async allegationAction(_id: string, _action: 'accept' | 'reject', _leadSlug: string): Promise<AllegationActionResult> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }

  async findingAction(_id: string, _action: 'verify' | 'reject'): Promise<FindingActionResult> {
    throw new Error('IPC transport not implemented — use HttpAgentTransport for now')
  }
}
