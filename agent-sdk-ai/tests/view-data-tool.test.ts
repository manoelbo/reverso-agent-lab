import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { viewDataTool } from '../src/tools/view-data'

describe('viewDataTool', () => {
  it('lista contagens de fonte, leads, allegations e findings', async () => {
    const filesystemRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-view-data-'))
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-view-data-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = filesystemRoot
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot

    await mkdir(path.join(filesystemRoot, 'source'), { recursive: true })
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

    await mkdir(path.join(filesystemRoot, 'investigation', 'leads'), { recursive: true })
    await writeFile(
      path.join(filesystemRoot, 'investigation', 'leads', 'lead-caso-a.md'),
      'title: "Caso A"\nstatus: planned\n',
      'utf8'
    )
    await mkdir(path.join(filesystemRoot, 'investigation', 'allegations'), {
      recursive: true,
    })
    await mkdir(path.join(filesystemRoot, 'investigation', 'findings'), { recursive: true })
    await writeFile(
      path.join(filesystemRoot, 'investigation', 'allegations', 'allegation-a.md'),
      '# Alegação A',
      'utf8'
    )
    await writeFile(
      path.join(filesystemRoot, 'investigation', 'findings', 'finding-a.md'),
      '# Finding A',
      'utf8'
    )

    const execute = (viewDataTool as unknown as { execute: (input: { query: string }) => Promise<any> })
      .execute
    const result = await execute({ query: 'listar tudo' })

    assert.equal(result.ok, true)
    assert.equal(result.source.processed, 1)
    assert.equal(result.leads.length, 1)
    assert.equal(result.leads[0].slug, 'caso-a')
    assert.equal(result.allegationsCount, 1)
    assert.equal(result.findingsCount, 1)
  })
})
