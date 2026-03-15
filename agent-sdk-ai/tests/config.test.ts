import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveConfig } from '../src/lib/config'

describe('resolveConfig', () => {
  it('prioriza REVERSO_AGENT_LEGACY_ROOT sobre alias antigo', () => {
    const originalPreferred = process.env['REVERSO_AGENT_LEGACY_ROOT']
    const originalAlias = process.env['REVERSO_LEGACY_ROOT']
    const originalFilesystem = process.env['REVERSO_FILESYSTEM_ROOT']
    try {
      process.env['REVERSO_AGENT_LEGACY_ROOT'] = '/tmp/reverso-agent-legacy-priority'
      process.env['REVERSO_LEGACY_ROOT'] = '/tmp/reverso-agent-legacy-old'
      process.env['REVERSO_FILESYSTEM_ROOT'] = '/tmp/reverso-agent-filesystem'

      const config = resolveConfig()
      assert.equal(config.paths.legacyRoot, path.resolve('/tmp/reverso-agent-legacy-priority'))
      assert.equal(config.paths.filesystemRoot, path.resolve('/tmp/reverso-agent-filesystem'))
    } finally {
      if (originalPreferred === undefined) {
        delete process.env['REVERSO_AGENT_LEGACY_ROOT']
      } else {
        process.env['REVERSO_AGENT_LEGACY_ROOT'] = originalPreferred
      }

      if (originalAlias === undefined) {
        delete process.env['REVERSO_LEGACY_ROOT']
      } else {
        process.env['REVERSO_LEGACY_ROOT'] = originalAlias
      }

      if (originalFilesystem === undefined) {
        delete process.env['REVERSO_FILESYSTEM_ROOT']
      } else {
        process.env['REVERSO_FILESYSTEM_ROOT'] = originalFilesystem
      }
    }
  })
})
