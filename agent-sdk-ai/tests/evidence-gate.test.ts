import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyEvidenceGate } from '../src/lib/evidence-gate'
import type { InquiryFinding } from '../src/lib/contracts'

describe('applyEvidenceGate', () => {
  it('mantém finding com evidências verificadas', () => {
    const findings: InquiryFinding[] = [
      {
        id: 'f1',
        claim: 'Existe sobrepreço',
        status: 'verified',
        supportsAllegationIds: ['a1'],
        evidence: [
          {
            source_id: 'doc-1',
            source: 'doc-1',
            excerpt: 'trecho',
            location: { kind: 'pdf', page: 10 },
            confidence: 0.84,
            verification_status: 'verified',
          },
        ],
      },
    ]

    const result = applyEvidenceGate(findings, { minConfidence: 0.7 })

    assert.equal(result.verified.length, 1)
    assert.equal(result.reviewQueue.length, 0)
  })

  it('envia para review quando não há evidência suficiente', () => {
    const findings: InquiryFinding[] = [
      {
        id: 'f2',
        claim: 'Alega favorecimento',
        status: 'verified',
        supportsAllegationIds: ['a2'],
        evidence: [
          {
            source_id: 'doc-2',
            source: 'doc-2',
            excerpt: 'trecho fraco',
            location: { kind: 'unknown' },
            confidence: 0.2,
            verification_status: 'missing',
          },
        ],
      },
    ]

    const result = applyEvidenceGate(findings, { minConfidence: 0.7 })

    assert.equal(result.verified.length, 0)
    assert.equal(result.reviewQueue.length, 1)
    assert.equal(result.reviewQueue[0]?.status, 'unverified')
  })
})
