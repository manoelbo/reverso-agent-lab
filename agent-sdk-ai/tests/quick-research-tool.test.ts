import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { quickResearchTool } from '../src/tools/quick-research'

describe('quickResearchTool', () => {
  it('retorna orientação quando não há previews processados', async () => {
    const prevFilesystem = process.env['REVERSO_FILESYSTEM_ROOT']
    const prevLegacy = process.env['REVERSO_LEGACY_ROOT']
    const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-quick-research-'))
    const legacy = await mkdtemp(path.join(os.tmpdir(), 'reverso-quick-research-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = root
    process.env['REVERSO_LEGACY_ROOT'] = legacy

    try {
      await mkdir(path.join(root, 'source'), { recursive: true })
      const execute = (quickResearchTool as unknown as {
        execute: (input: { question: string }) => Promise<any>
      }).execute
      const result = await execute({ question: 'Qual o principal risco?' })

      assert.equal(result.ok, false)
      assert.equal(Array.isArray(result.sources), true)
      assert.equal(result.sources.length, 0)
      assert.ok(
        (result.answer as string).includes('Não encontrei documentos processados')
      )
    } finally {
      if (prevFilesystem === undefined) delete process.env['REVERSO_FILESYSTEM_ROOT']
      else process.env['REVERSO_FILESYSTEM_ROOT'] = prevFilesystem

      if (prevLegacy === undefined) delete process.env['REVERSO_LEGACY_ROOT']
      else process.env['REVERSO_LEGACY_ROOT'] = prevLegacy
    }
  })
})
