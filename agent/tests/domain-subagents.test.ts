import test from 'node:test'
import assert from 'node:assert/strict'
import { runDomainSubagents } from '../src/core/domain-subagents.js'

test('domain-subagents: consolida evidencias com dedupe', async () => {
  const result = await runDomainSubagents({
    plans: [
      { domain: 'contracts', objective: 'o', readOnlyContext: 'c', maxEvidenceItems: 2 },
      { domain: 'timeline', objective: 'o', readOnlyContext: 'c', maxEvidenceItems: 2 }
    ],
    executor: (plan) => ({
      domain: plan.domain,
      ok: true,
      summary: `done:${plan.domain}`,
      evidence: [
        {
          source_id: 'doc-1',
          source: 'doc-1',
          excerpt: 'mesmo trecho',
          location: { kind: 'pdf', page: 1 },
          confidence: 0.8,
          verification_status: 'verified'
        }
      ],
      warnings: []
    })
  })

  assert.equal(result.outputs.length, 2)
  assert.equal(result.consolidatedEvidence.length, 1)
})

test('domain-subagents: falha parcial gera warning e degradacao controlada', async () => {
  const result = await runDomainSubagents({
    plans: [
      { domain: 'contracts', objective: 'o', readOnlyContext: 'c', maxEvidenceItems: 1 },
      { domain: 'timeline', objective: 'o', readOnlyContext: 'c', maxEvidenceItems: 1 }
    ],
    executor: (plan) => {
      if (plan.domain === 'timeline') throw new Error('boom')
      return {
        domain: plan.domain,
        ok: true,
        summary: 'ok',
        evidence: [],
        warnings: []
      }
    }
  })
  assert.equal(result.outputs.length, 2)
  assert.ok(result.warnings.some((item) => item.includes('timeline')))
})
