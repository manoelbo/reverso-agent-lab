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

  it('aplica TTL de sessão deep-dive configurável', () => {
    const originalTtl = process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
    try {
      process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = '5000'
      const config = resolveConfig()
      assert.equal(config.deepDiveSessionTtlMs, 5000)
    } finally {
      if (originalTtl === undefined) {
        delete process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
      } else {
        process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = originalTtl
      }
    }
  })

  it('usa TTL default quando valor configurado é inválido', () => {
    const originalTtl = process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
    try {
      process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = 'invalido'
      const config = resolveConfig()
      assert.equal(config.deepDiveSessionTtlMs, 72 * 60 * 60 * 1000)
    } finally {
      if (originalTtl === undefined) {
        delete process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS']
      } else {
        process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] = originalTtl
      }
    }
  })

  it('usa AGENT_LAB_MODEL como fallback quando REVERSO_MODEL_ID não está definido', () => {
    const originalReversoModel = process.env['REVERSO_MODEL_ID']
    const originalAgentLabModel = process.env['AGENT_LAB_MODEL']
    try {
      delete process.env['REVERSO_MODEL_ID']
      process.env['AGENT_LAB_MODEL'] = 'google/gemini-2.5-flash'

      const config = resolveConfig()
      assert.equal(config.modelId, 'google/gemini-2.5-flash')
    } finally {
      if (originalReversoModel === undefined) {
        delete process.env['REVERSO_MODEL_ID']
      } else {
        process.env['REVERSO_MODEL_ID'] = originalReversoModel
      }

      if (originalAgentLabModel === undefined) {
        delete process.env['AGENT_LAB_MODEL']
      } else {
        process.env['AGENT_LAB_MODEL'] = originalAgentLabModel
      }
    }
  })
})
