import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { createLeadTool } from '../src/tools/create-lead'

async function withToolEnv<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const prevFilesystem = process.env['REVERSO_FILESYSTEM_ROOT']
  const prevLegacy = process.env['REVERSO_LEGACY_ROOT']
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-create-lead-'))
  const legacy = await mkdtemp(path.join(os.tmpdir(), 'reverso-create-lead-legacy-'))
  process.env['REVERSO_FILESYSTEM_ROOT'] = root
  process.env['REVERSO_LEGACY_ROOT'] = legacy

  try {
    return await fn(root)
  } finally {
    if (prevFilesystem === undefined) delete process.env['REVERSO_FILESYSTEM_ROOT']
    else process.env['REVERSO_FILESYSTEM_ROOT'] = prevFilesystem

    if (prevLegacy === undefined) delete process.env['REVERSO_LEGACY_ROOT']
    else process.env['REVERSO_LEGACY_ROOT'] = prevLegacy
  }
}

describe('createLeadTool', () => {
  it('retorna duplicidade sem chamar comando legado quando título já existe', async () => {
    await withToolEnv(async (root) => {
      const leadsDir = path.join(root, 'investigation', 'leads')
      await mkdir(leadsDir, { recursive: true })
      await writeFile(
        path.join(leadsDir, 'lead-fraude-obras.md'),
        'title: "Fraude em obras públicas"\nstatus: planned\n',
        'utf8'
      )

      const execute = (createLeadTool as unknown as {
        execute: (input: { idea: string }) => Promise<any>
      }).execute
      const result = await execute({ idea: 'Fraude em obras públicas' })

      assert.equal(result.ok, false)
      assert.equal(result.duplicated, true)
      assert.equal(result.matchedWith, 'fraude-obras')
    })
  })
})
