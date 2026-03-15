import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { detectSystemState } from '../src/lib/source-state'
import type { ReversoPaths } from '../src/lib/config'

async function setupPaths(): Promise<ReversoPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-sdk-state-'))
  const sourceDir = path.join(root, 'source')
  const leadsDir = path.join(root, 'investigation', 'leads')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(leadsDir, { recursive: true })

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
    leadsDir,
    allegationsDir: path.join(root, 'investigation', 'allegations'),
    findingsDir: path.join(root, 'investigation', 'findings'),
    dossierDir: path.join(root, 'dossier'),
  }
}

describe('detectSystemState', () => {
  it('detecta pendências e processados via checkpoint', async () => {
    const paths = await setupPaths()

    await writeFile(path.join(paths.sourceDir, 'a.pdf'), '')
    await writeFile(path.join(paths.sourceDir, 'b.pdf'), '')
    await writeFile(path.join(paths.sourceDir, 'c.pdf'), '')
    await writeFile(
      path.join(paths.sourceDir, 'source-checkpoint.json'),
      JSON.stringify(
        {
          files: [
            { docId: 'a', originalFileName: 'a.pdf', status: 'done' },
            {
              docId: 'b',
              originalFileName: 'b.pdf',
              status: 'failed',
              lastError: 'falha',
            },
          ],
        },
        null,
        2
      )
    )
    await writeFile(path.join(paths.outputDir, 'agent.md'), '# contexto')
    await writeFile(path.join(paths.leadsDir, 'lead-x.md'), '# lead')

    const state = await detectSystemState(paths)
    assert.equal(state.sourceEmpty, false)
    assert.equal(state.processedFiles.length, 1)
    assert.equal(state.failedFiles.length, 1)
    assert.equal(state.unprocessedFiles.length, 1)
    assert.equal(state.hasAgentContext, true)
    assert.equal(state.leadsCount, 1)
  })

  it('marca previews sem init quando há processado mas não existe agent.md', async () => {
    const paths = await setupPaths()

    await writeFile(path.join(paths.sourceDir, 'doc.pdf'), '')
    await writeFile(
      path.join(paths.sourceDir, 'source-checkpoint.json'),
      JSON.stringify(
        {
          files: [{ docId: 'doc', originalFileName: 'doc.pdf', status: 'done' }],
        },
        null,
        2
      ),
      'utf8'
    )

    const state = await detectSystemState(paths)
    assert.equal(state.sourceEmpty, false)
    assert.equal(state.processedFiles.length, 1)
    assert.equal(state.hasAgentContext, false)
    assert.equal(state.hasPreviewsWithoutInit, true)
    assert.equal(state.isFirstVisit, true)
  })

  it('detecta source vazio quando não há PDFs', async () => {
    const paths = await setupPaths()
    const state = await detectSystemState(paths)

    assert.equal(state.sourceEmpty, true)
    assert.equal(state.totalSourceFiles, 0)
    assert.equal(state.processedFiles.length, 0)
    assert.equal(state.unprocessedFiles.length, 0)
    assert.equal(state.failedFiles.length, 0)
  })
})
