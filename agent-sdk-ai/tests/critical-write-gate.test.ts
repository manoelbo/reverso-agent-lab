import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCriticalWriteGateDecision } from '../src/lib/critical-write-gate'

describe('resolveCriticalWriteGateDecision', () => {
  it('bypassa quando gate está desativado', () => {
    const decision = resolveCriticalWriteGateDecision({
      gateEnabled: false,
      requireExplicitWriteApproval: true,
      hasPersistActionPlanned: true,
    })
    assert.equal(decision.mode, 'bypassed')
    assert.equal(decision.approved, true)
  })

  it('aprova quando persistência foi planejada e objetivo alcançado', () => {
    const decision = resolveCriticalWriteGateDecision({
      gateEnabled: true,
      requireExplicitWriteApproval: true,
      hasPersistActionPlanned: true,
      orchestrationStopReason: 'goal_reached',
    })
    assert.equal(decision.mode, 'approved')
    assert.equal(decision.approved, true)
  })

  it('bloqueia quando stop reason não permite escrita crítica', () => {
    const decision = resolveCriticalWriteGateDecision({
      gateEnabled: true,
      requireExplicitWriteApproval: true,
      hasPersistActionPlanned: true,
      orchestrationStopReason: 'insufficient_evidence',
    })
    assert.equal(decision.mode, 'blocked')
    assert.equal(decision.approved, false)
  })
})
