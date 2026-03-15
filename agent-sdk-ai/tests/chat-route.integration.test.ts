import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
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

function parseStreamDataParts(payload: string): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = []
  for (const line of payload.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const value = line.slice('data: '.length).trim()
    if (!value || value === '[DONE]') continue
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>
      parts.push(parsed)
    } catch {
      // ignora linhas não-json
    }
  }
  return parts
}

function firstQueuePart(payload: string): { data?: { steps?: string[] } } | undefined {
  const parts = parseStreamDataParts(payload)
  return parts.find((part) => part.type === 'data-queue') as
    | { data?: { steps?: string[] } }
    | undefined
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
    const parts = parseStreamDataParts(payload)
    const startPart = parts.find((part) => part.type === 'start')

    assert.equal(response.status, 200)
    assert.ok(payload.includes('"type":"data-workflow"'))
    assert.ok(payload.includes('"type":"data-queue"'))
    assert.ok(payload.includes('"type":"data-suggestion"'))
    assert.ok(payload.includes('"Auto-accept está desligado'))
    assert.equal(
      (startPart as { messageMetadata?: { intent?: string } } | undefined)?.messageMetadata
        ?.intent,
      'greeting'
    )
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
    const startPart = parseStreamDataParts(payload).find((part) => part.type === 'start')

    assert.equal(response.status, 200)
    assert.ok(payload.includes('"Auto-accept está ativo'))
    assert.equal(
      (startPart as { messageMetadata?: { intent?: string } } | undefined)?.messageMetadata
        ?.intent,
      'process_documents'
    )
  })

  it('enfileira orientação de upload quando source está vazio em deep-dive', async () => {
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
        messages: createUserMessage('faça um deep-dive nas fontes'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()
    const queue = firstQueuePart(payload)

    assert.equal(response.status, 200)
    assert.ok((queue?.data?.steps ?? []).some((step) => step.includes('base de fontes está vazia')))
  })

  it('enfileira processamento quando existem PDFs pendentes', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''
    await writeFile(path.join(filesystemRoot, 'source', 'pendente.pdf'), '')

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('faça um deep-dive nas fontes'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()
    const queue = firstQueuePart(payload)

    assert.equal(response.status, 200)
    assert.ok((queue?.data?.steps ?? []).some((step) => step.includes('PDFs pendentes')))
  })

  it('enfileira init quando há previews sem agent.md', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''
    await writeFile(path.join(filesystemRoot, 'source', 'doc-a.pdf'), '')
    await writeFile(
      path.join(filesystemRoot, 'source', 'source-checkpoint.json'),
      JSON.stringify(
        {
          files: [{ docId: 'doc-a', originalFileName: 'doc-a.pdf', status: 'done' }],
        },
        null,
        2
      ),
      'utf8'
    )

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('quais são os pontos principais?'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()
    const queue = firstQueuePart(payload)

    assert.equal(response.status, 200)
    assert.ok((queue?.data?.steps ?? []).some((step) => step.includes('Execute initContext')))

    const steps = queue?.data?.steps ?? []
    const idxInit = steps.findIndex((step) => step.includes('Execute initContext'))
    const idxIntent = steps.findIndex((step) => step.includes('Atender intenção: quick_research'))
    assert.ok(idxInit >= 0)
    assert.ok(idxIntent > idxInit)
  })

  it('persiste histórico da conversa ao finalizar o stream', async () => {
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
    await response.text()

    const sessionRaw = await readFile(
      path.join(filesystemRoot, 'sessions', 'sdk-chat', 'default.json'),
      'utf8'
    )
    const session = JSON.parse(sessionRaw) as { messages?: unknown[]; id?: string }
    assert.equal(session.id, 'default')
    assert.ok(Array.isArray(session.messages))
    assert.ok((session.messages ?? []).length >= 1)
  })

  it('ordena fila como process -> init -> intent quando aplicável', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''

    await writeFile(path.join(filesystemRoot, 'source', 'doc-a.pdf'), '')
    await writeFile(path.join(filesystemRoot, 'source', 'doc-b.pdf'), '')
    await writeFile(
      path.join(filesystemRoot, 'source', 'source-checkpoint.json'),
      JSON.stringify(
        {
          files: [{ docId: 'doc-a', originalFileName: 'doc-a.pdf', status: 'done' }],
        },
        null,
        2
      ),
      'utf8'
    )

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('quais são os pontos principais?'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()
    const steps = firstQueuePart(payload)?.data?.steps ?? []

    const idxProcess = steps.findIndex((step) => step.includes('PDFs pendentes'))
    const idxInit = steps.findIndex((step) => step.includes('Execute initContext'))
    const idxIntent = steps.findIndex((step) => step.includes('Atender intenção: quick_research'))

    assert.ok(idxProcess >= 0)
    assert.ok(idxInit > idxProcess)
    assert.ok(idxIntent > idxInit)
  })

  it('inclui passo de continuidade quando há sessão deep-dive ativa', async () => {
    const filesystemRoot = await prepareFilesystemRoot()
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot
    process.env['AI_GATEWAY_API_KEY'] = ''
    process.env['OPENROUTER_API_KEY'] = ''

    const deepDiveDir = path.join(filesystemRoot, 'sessions', 'deep-dive')
    await mkdir(deepDiveDir, { recursive: true })
    await writeFile(
      path.join(deepDiveDir, 'active-session.json'),
      JSON.stringify({ sessionId: 'sess-ativa' }, null, 2),
      'utf8'
    )
    await writeFile(
      path.join(deepDiveDir, 'sess-ativa.json'),
      JSON.stringify({ stage: 'awaiting_plan_decision', sessionId: 'sess-ativa' }, null, 2),
      'utf8'
    )

    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: createUserMessage('continue'),
        autoAccept: false,
      }),
    })

    const response = await POST(request)
    const payload = await response.text()
    const steps = firstQueuePart(payload)?.data?.steps ?? []

    assert.equal(response.status, 200)
    assert.ok(steps.some((step) => step.includes('sessão deep-dive ativa')))
    assert.ok(steps.some((step) => step.includes('Atender intenção: deep_dive_next')))
  })
})
