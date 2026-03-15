import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises'
import type { ReversoPaths } from '../src/lib/config'
import {
  loadActiveDeepDiveSession,
  loadChatMessages,
  saveChatMessages,
} from '../src/lib/session-store'

async function createPaths(): Promise<ReversoPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-session-'))
  return {
    projectRoot: root,
    legacyRoot: root,
    filesystemRoot: root,
    sourceDir: path.join(root, 'source'),
    sourceArtifactsDir: path.join(root, 'source', '.artifacts'),
    outputDir: root,
    reportsDir: path.join(root, 'reports'),
    eventsDir: path.join(root, 'events'),
    investigationDir: path.join(root, 'investigation'),
    leadsDir: path.join(root, 'investigation', 'leads'),
    allegationsDir: path.join(root, 'investigation', 'allegations'),
    findingsDir: path.join(root, 'investigation', 'findings'),
    dossierDir: path.join(root, 'dossier'),
  }
}

describe('session-store', () => {
  it('salva e carrega mensagens de chat', async () => {
    const paths = await createPaths()
    await saveChatMessages(paths, [{ role: 'user', parts: [{ type: 'text', text: 'oi' }] }])

    const messages = await loadChatMessages(paths)
    assert.equal(messages.length, 1)

    const raw = await readFile(
      path.join(paths.filesystemRoot, 'sessions', 'sdk-chat', 'default.json'),
      'utf8'
    )
    assert.ok(raw.includes('"id": "default"'))
  })

  it('carrega sessão deep-dive ativa por ponteiro', async () => {
    const paths = await createPaths()
    const sessionDir = path.join(paths.filesystemRoot, 'sessions', 'deep-dive')
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      path.join(sessionDir, 'active-session.json'),
      JSON.stringify({ sessionId: 'abc' }, null, 2),
      'utf8'
    )
    await writeFile(
      path.join(sessionDir, 'abc.json'),
      JSON.stringify({ stage: 'awaiting_plan_decision', sessionId: 'abc' }, null, 2),
      'utf8'
    )

    const session = await loadActiveDeepDiveSession(paths)
    assert.equal(session?.stage, 'awaiting_plan_decision')
  })

  it('usa fallback de sessão deep-dive legada quando ponteiro não existe', async () => {
    const paths = await createPaths()
    await writeFile(
      path.join(paths.filesystemRoot, 'deep-dive-session.json'),
      JSON.stringify({ stage: 'completed', sessionId: 'legacy' }, null, 2),
      'utf8'
    )

    const session = await loadActiveDeepDiveSession(paths)
    assert.equal(session?.stage, 'completed')
  })

  it('ignora sessão deep-dive expirada pelo TTL', async () => {
    const previousTtl = process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
    process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = '1000'
    try {
      const paths = await createPaths()
      const sessionDir = path.join(paths.filesystemRoot, 'sessions', 'deep-dive')
      await mkdir(sessionDir, { recursive: true })
      await writeFile(
        path.join(sessionDir, 'active-session.json'),
        JSON.stringify({ sessionId: 'old-session' }, null, 2),
        'utf8'
      )
      await writeFile(
        path.join(sessionDir, 'old-session.json'),
        JSON.stringify(
          {
            stage: 'awaiting_plan_decision',
            sessionId: 'old-session',
            updatedAt: '2000-01-01T00:00:00.000Z',
          },
          null,
          2
        ),
        'utf8'
      )

      const session = await loadActiveDeepDiveSession(paths)
      assert.equal(session, undefined)
    } finally {
      if (previousTtl === undefined) {
        delete process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
      } else {
        process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = previousTtl
      }
    }
  })
})
