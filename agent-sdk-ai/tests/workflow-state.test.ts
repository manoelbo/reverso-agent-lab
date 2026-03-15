import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
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

  it('prioriza processamento quando há PDFs pendentes', async () => {
    const paths = await createMinimalPaths()
    await writeFile(path.join(paths.sourceDir, 'pendente.pdf'), '')

    const snapshot = await loadWorkflowSnapshot({
      paths,
      userText: 'investigue este caso',
      classifyIntent: async () => ({
        intent: 'deep_dive',
        confidence: 0.9,
        reason: 'pedido investigativo',
      }),
    })

    assert.ok(
      snapshot.guidance.preflight.some((line) => line.includes('PDFs pendentes'))
    )
    assert.equal(snapshot.queuePlan.steps.at(-1), 'Atender intenção: deep_dive')
  })

  it('enfileira init automático quando há previews sem agent.md', async () => {
    const paths = await createMinimalPaths()
    await writeFile(path.join(paths.sourceDir, 'doc-a.pdf'), '')
    await writeFile(
      path.join(paths.sourceDir, 'source-checkpoint.json'),
      JSON.stringify(
        {
          files: [{ docId: 'doc-a', originalFileName: 'doc-a.pdf', status: 'done' }],
        },
        null,
        2
      ),
      'utf8'
    )

    const snapshot = await loadWorkflowSnapshot({
      paths,
      userText: 'resuma os dados',
      classifyIntent: async () => ({
        intent: 'quick_research',
        confidence: 0.75,
        reason: 'pergunta factual',
      }),
    })

    assert.ok(
      snapshot.guidance.preflight.some((line) => line.includes('initContext'))
    )
  })

  it('detecta sessão deep-dive ativa e prioriza continuidade', async () => {
    const paths = await createMinimalPaths()
    const deepDiveDir = path.join(paths.filesystemRoot, 'sessions', 'deep-dive')
    await mkdir(deepDiveDir, { recursive: true })
    await writeFile(
      path.join(deepDiveDir, 'active-session.json'),
      JSON.stringify({ sessionId: 'sess-1' }, null, 2),
      'utf8'
    )
    await writeFile(
      path.join(deepDiveDir, 'sess-1.json'),
      JSON.stringify({ stage: 'awaiting_plan_decision', sessionId: 'sess-1' }, null, 2),
      'utf8'
    )

    const snapshot = await loadWorkflowSnapshot({
      paths,
      userText: 'continue',
      classifyIntent: async () => ({
        intent: 'deep_dive_next',
        confidence: 0.83,
        reason: 'continuidade',
      }),
    })

    assert.equal(snapshot.guidance.shouldPrioritizeDeepDiveSession, true)
    assert.ok(
      snapshot.guidance.preflight.some((line) => line.includes('sessão deep-dive ativa'))
    )
  })

  it('ignora sessão deep-dive expirada pelo TTL ao montar workflow', async () => {
    const previousTtl = process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
    process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = '1000'
    try {
      const paths = await createMinimalPaths()
      const deepDiveDir = path.join(paths.filesystemRoot, 'sessions', 'deep-dive')
      await mkdir(deepDiveDir, { recursive: true })
      await writeFile(
        path.join(deepDiveDir, 'active-session.json'),
        JSON.stringify({ sessionId: 'sess-expirada' }, null, 2),
        'utf8'
      )
      await writeFile(
        path.join(deepDiveDir, 'sess-expirada.json'),
        JSON.stringify(
          {
            stage: 'awaiting_plan_decision',
            sessionId: 'sess-expirada',
            updatedAt: '2000-01-01T00:00:00.000Z',
          },
          null,
          2
        ),
        'utf8'
      )

      const snapshot = await loadWorkflowSnapshot({
        paths,
        userText: 'continue',
        classifyIntent: async () => ({
          intent: 'deep_dive_next',
          confidence: 0.83,
          reason: 'continuidade',
        }),
      })

      assert.equal(snapshot.session, undefined)
      assert.equal(snapshot.guidance.shouldPrioritizeDeepDiveSession, false)
      assert.ok(
        !snapshot.guidance.preflight.some((line) =>
          line.includes('sessão deep-dive ativa')
        )
      )
    } finally {
      if (previousTtl === undefined) {
        delete process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
      } else {
        process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = previousTtl
      }
    }
  })
})
