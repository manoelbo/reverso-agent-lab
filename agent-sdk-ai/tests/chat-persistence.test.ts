import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import type { ReversoPaths } from '../src/lib/config'
import { loadPersistedChat, persistChat } from '../src/lib/chat-persistence'

async function createPaths(): Promise<ReversoPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-chat-persist-'))
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

describe('chat-persistence', () => {
  it('persiste e recarrega mensagens tipadas', async () => {
    const paths = await createPaths()
    const messages = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'oi' }],
      },
    ] as any

    await persistChat(paths, messages)
    const loaded = await loadPersistedChat(paths)

    assert.equal(loaded.length, 1)
    assert.equal((loaded[0] as any).role, 'user')
  })
})
