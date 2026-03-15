import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { validateWithSelfRepair } from '../src/lib/self-repair'

describe('validateWithSelfRepair', () => {
  it('valida imediatamente quando JSON já está correto', async () => {
    const schema = z.object({
      ok: z.boolean(),
      value: z.number(),
    })

    const result = await validateWithSelfRepair({
      raw: '{"ok":true,"value":42}',
      schema,
      contractName: 'test.contract',
      maxAttempts: 0,
    })

    assert.equal(result.ok, true)
    assert.equal(result.value?.ok, true)
    assert.equal(result.value?.value, 42)
    assert.equal(result.attempts.length, 0)
  })
})
