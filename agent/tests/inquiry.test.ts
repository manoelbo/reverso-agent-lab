import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveNeedsRepairReasons,
  parseInquiryResponse,
  resolveCriticalWriteGateDecision,
  recoverInquiryFromRawPayload
} from '../src/runner/run-inquiry.js'

test('parseInquiryResponse parseia findings com evidence multipla', () => {
  const raw = JSON.stringify({
    scenario: 'positive',
    confidence: 0.92,
    conclusion: 'Conclusao da inquiry.',
    allegations: [{ id: 'allegation-cartel', statement: 'Ha indicios de cartel.' }],
    findings: [
      {
        id: 'finding-preco',
        claim: 'Preco 38% acima do segundo colocado.',
        status: 'verified',
        supportsAllegationIds: ['allegation-cartel'],
        evidence: [
          { source: 'contrato-042.pdf', page: 87, excerpt: 'valor 38% acima' },
          { source: 'edital-042.pdf', page: 4, excerpt: 'estimativa de referencia' }
        ]
      }
    ]
  })
  const parsed = parseInquiryResponse(raw)
  assert.equal(parsed.scenario, 'positive')
  assert.equal(parsed.confidence, 0.92)
  assert.equal(parsed.allegations.length, 1)
  assert.equal(parsed.findings.length, 1)
  assert.equal(parsed.findings[0]?.evidence.length, 2)
  assert.equal(parsed.findings[0]?.evidence[0]?.source, 'contrato-042.pdf')
})

test('parseInquiryResponse aplica fallback para payload invalido', () => {
  const parsed = parseInquiryResponse('not-json')
  assert.equal(parsed.scenario, 'negative')
  assert.equal(parsed.confidence, 0.4)
  assert.equal(parsed.allegations.length, 0)
  assert.equal(parsed.findings.length, 0)
})

test('parseInquiryResponse descarta finding sem evidence', () => {
  const raw = JSON.stringify({
    scenario: 'positive',
    confidence: 0.8,
    conclusion: 'ok',
    allegations: [{ id: 'a-1', statement: 'A1' }],
    findings: [
      {
        id: 'f-1',
        claim: 'claim sem evidencia',
        status: 'verified',
        supportsAllegationIds: ['a-1'],
        evidence: []
      }
    ]
  })
  const parsed = parseInquiryResponse(raw)
  assert.equal(parsed.findings.length, 0)
})

test('parseInquiryResponse aceita evidence v2 com source_id/location', () => {
  const raw = JSON.stringify({
    scenario: 'positive',
    confidence: 0.88,
    conclusion: 'ok',
    allegations: [{ id: 'a-1', statement: 'A1' }],
    findings: [
      {
        id: 'f-1',
        claim: 'claim com evidence v2',
        status: 'verified',
        supportsAllegationIds: ['a-1'],
        evidence: [
          {
            source_id: 'doc-1',
            excerpt: 'trecho literal',
            location: { kind: 'pdf', page: 9 },
            confidence: 0.82,
            verification_status: 'verified'
          }
        ]
      }
    ]
  })
  const parsed = parseInquiryResponse(raw)
  assert.equal(parsed.findings.length, 1)
  assert.equal(parsed.findings[0]?.evidence[0]?.source_id, 'doc-1')
  assert.equal(parsed.findings[0]?.evidence[0]?.verification_status, 'verified')
})

test('recoverInquiryFromRawPayload remove findings sem evidence e mantem os validos', () => {
  const raw = JSON.stringify({
    scenario: 'positive',
    confidence: 0.9,
    conclusion: 'ok',
    allegations: [{ id: 'a-1', statement: 'A1' }],
    findings: [
      {
        id: 'f-1',
        claim: 'sem evidencia',
        status: 'unverified',
        supportsAllegationIds: ['a-1'],
        evidence: []
      },
      {
        id: 'f-2',
        claim: 'com evidencia',
        status: 'verified',
        supportsAllegationIds: ['a-1'],
        evidence: [
          {
            source_id: 'doc-1',
            excerpt: 'trecho',
            location: { kind: 'pdf', page: 3 },
            confidence: 0.8,
            verification_status: 'verified'
          }
        ]
      }
    ]
  })
  const recovered = recoverInquiryFromRawPayload(raw)
  assert.equal(recovered.rawFindings, 2)
  assert.equal(recovered.parsed.findings.length, 1)
  assert.equal(recovered.droppedFindings, 1)
  assert.equal(recovered.parsed.findings[0]?.id, 'f-2')
})

test('deriveNeedsRepairReasons sinaliza fallback com descarte de findings', () => {
  const reasons = deriveNeedsRepairReasons({
    droppedFindings: 1,
    rawFindings: 2,
    parsedFindings: 1
  })
  assert.deepEqual(reasons, ['contract_validation_failed', 'dropped_findings:1'])
})

test('resolveCriticalWriteGateDecision aprova quando persist foi planejado e loop atingiu goal', () => {
  const decision = resolveCriticalWriteGateDecision({
    gateEnabled: true,
    requireExplicitWriteApproval: true,
    hasPersistActionPlanned: true,
    orchestrationStopReason: 'goal_reached'
  })
  assert.equal(decision.approved, true)
  assert.equal(decision.mode, 'approved')
})

test('resolveCriticalWriteGateDecision mantém bloqueio P0 quando falta persist planejado', () => {
  const decision = resolveCriticalWriteGateDecision({
    gateEnabled: true,
    requireExplicitWriteApproval: true,
    hasPersistActionPlanned: false,
    orchestrationStopReason: 'goal_reached'
  })
  assert.equal(decision.approved, false)
  assert.equal(decision.mode, 'blocked')
  assert.match(decision.reason, /missing_explicit_persist_approval/)
})
