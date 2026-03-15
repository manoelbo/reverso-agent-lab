import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  compactOutput,
  parseToolContext,
  requiresApproval,
} from '../src/tools/helpers'

describe('tool helpers', () => {
  it('parseToolContext extrai autoAccept boolean', () => {
    assert.deepEqual(parseToolContext({ autoAccept: true }), { autoAccept: true })
    assert.deepEqual(parseToolContext({ autoAccept: false }), { autoAccept: false })
    assert.deepEqual(parseToolContext({ autoAccept: 'x' }), { autoAccept: undefined })
    assert.deepEqual(parseToolContext(undefined), {})
  })

  it('requiresApproval respeita autoAccept', () => {
    assert.equal(requiresApproval({ autoAccept: true }), false)
    assert.equal(requiresApproval({ autoAccept: false }), true)
    assert.equal(requiresApproval({}), true)
  })

  it('compactOutput trunca acima do limite', () => {
    const text = 'a'.repeat(50)
    const compacted = compactOutput(text, 10)
    assert.ok(compacted.includes('...[truncado]'))
    assert.ok(compacted.startsWith('a'.repeat(10)))
  })
})
