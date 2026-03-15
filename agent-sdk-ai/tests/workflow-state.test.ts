import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { loadWorkflowSnapshot } from '../src/lib/workflow-state'
import type { ReversoPaths } from '../src/lib/config'

async function createMinimalPaths(): Promise<ReversoPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-workflow-'))
  const sourceDir = path.join(root, 'source')
  await mkdir(sourceDir, { recursive: true })

  return {
    projectRoot: root,
    legacyRoot: root,
    filesystemRoot: root,
    sourceDir,
    sourceArtifactsDir: path.join(sourceDir, '.artifacts'),
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

describe('loadWorkflowSnapshot', () => {
  it('gera guidance e fila com intenção classificada', async () => {
    const paths = await createMinimalPaths()

    const snapshot = await loadWorkflowSnapshot({
      paths,
      userText: 'oi',
      classifyIntent: async () => ({
        intent: 'greeting',
        confidence: 0.99,
        reason: 'saudação',
      }),
    })

    assert.equal(snapshot.intent.intent, 'greeting')
    assert.equal(snapshot.queuePlan.steps.at(-1), 'Atender intenção: greeting')
    assert.ok(snapshot.guidance.preflight.length >= 1)
  })
})
