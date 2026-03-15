import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { POST } from '../src/app/api/chat/route'

function createUserMessage(text: string) {
  return [
    {
      id: 'u1',
      role: 'user',
      parts: [{ type: 'text', text }],
    },
  ]
}

async function prepareFilesystemRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-route-'))
  await mkdir(path.join(root, 'source'), { recursive: true })
  return root
}

describe('/api/chat route integration', () => {
  it('emite data parts de workflow e metadata para greeting', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('oi'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()

    assert.equal(response.status, 200)
    assert.ok(payload.includes('"type":"data-workflow"'))
    assert.ok(payload.includes('"type":"data-queue"'))
    assert.ok(payload.includes('"type":"data-suggestion"'))
    assert.ok(payload.includes('"intent":"greeting"'))
    assert.ok(payload.includes('"Auto-accept está desligado'))
  })

  it('reflete auto-accept ativo na sugestão de aprovação', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('processa os pdfs'),
        autoAccept: true,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()

    assert.equal(response.status, 200)
    assert.ok(payload.includes('"intent":"process_documents"'))
    assert.ok(payload.includes('"Auto-accept está ativo'))
  })
})
