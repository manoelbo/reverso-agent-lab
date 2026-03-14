import test from 'node:test'
import assert from 'node:assert/strict'
import { createPolicyComplianceHooks, resolveComplianceDecision } from '../src/core/compliance-hooks.js'

test('compliance-hooks: allow por default', () => {
  const decision = resolveComplianceDecision(
    {
      step: 1,
      action: { tool: 'processSourceTool', input: { subcommand: 'queue-status' } },
      inputHash: 'abc',
      inputSummary: '{}'
    },
    { defaultDecision: 'allow' }
  )
  assert.equal(decision.decision, 'allow')
  assert.equal(decision.source, 'default')
})

test('compliance-hooks: warn por risco', () => {
  const decision = resolveComplianceDecision(
    {
      step: 1,
      action: { tool: 'linkEntities', input: { filePath: '/tmp/a.md' } },
      inputHash: 'abc',
      inputSummary: '{}',
      definition: {
        name: 'linkEntities',
        requiredFields: ['filePath'],
        capabilities: ['crosscheck', 'persist'],
        sideEffects: 'write',
        riskLevel: 'high',
        estimatedCost: { tokens: 10, latencyMs: 10 }
      }
    },
    { defaultDecision: 'allow', byRisk: { high: 'warn' } }
  )
  assert.equal(decision.decision, 'warn')
  assert.equal(decision.reason, 'risk_policy:high')
})

test('compliance-hooks: deny por capability persist', async () => {
  const hooks = createPolicyComplianceHooks({
    defaultDecision: 'allow',
    byCapability: { persist: 'deny' }
  })
  const result = await hooks.preToolUse?.({
    step: 1,
    action: { tool: 'createTimelineEvent', input: { date: '2020-01-01', actors: ['A'], eventType: 'x', source: 's', description: 'd' } },
    inputHash: 'h',
    inputSummary: '{}',
    definition: {
      name: 'createTimelineEvent',
      requiredFields: ['date', 'actors', 'eventType', 'source', 'description'],
      capabilities: ['extract', 'persist'],
      sideEffects: 'write',
      riskLevel: 'medium',
      estimatedCost: { tokens: 1, latencyMs: 1 }
    }
  })
  assert.equal(result?.decision, 'deny')
  assert.equal(result?.source, 'capability')
})
