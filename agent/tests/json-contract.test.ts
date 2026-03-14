import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseStrictJson,
  validateCreateLeadPayload,
  validateDigComparisonPayload,
  validateDigIncrementalPayload,
  validateDigLinesPayload,
  validateInquiryFinalPayload,
  validateInquiryPlanPayload
} from '../src/core/json-contract.js'

test('parseStrictJson aceita JSON com code fence', () => {
  const parsed = parseStrictJson('```json\n{"ok":true}\n```')
  assert.equal(parsed.ok, true)
})

test('parseStrictJson rejeita texto fora do JSON', () => {
  const parsed = parseStrictJson('resultado:\n{"ok":true}')
  assert.equal(parsed.ok, false)
})

test('validateDigIncrementalPayload valida contrato completo', () => {
  const result = validateDigIncrementalPayload({
    summary: 'Resumo',
    keyFindings: ['F1'],
    hypotheses: ['H1'],
    gaps: ['G1']
  })
  assert.equal(result.ok, true)
})

test('validateDigLinesPayload exige campos obrigatorios', () => {
  const result = validateDigLinesPayload({
    lines: [{ title: 'Linha', rank: 1 }]
  })
  assert.equal(result.ok, false)
})

test('validateDigComparisonPayload valida topLines e recommendation', () => {
  const result = validateDigComparisonPayload({
    topLines: [{ title: 'L1', description: 'D1', differentiation: 'Diff', rank: 1 }],
    recommendation: 'Criar lead L1',
    overlapNotes: ['Sem sobreposicao critica']
  })
  assert.equal(result.ok, true)
})

test('validateCreateLeadPayload exige inquiryPlan completo', () => {
  const result = validateCreateLeadPayload({
    codename: 'linha-x',
    title: 'Linha X',
    description: 'Desc',
    inquiryPlan: {
      formulateAllegations: ['A'],
      defineSearchStrategy: ['S'],
      gatherFindings: ['G'],
      mapToAllegations: ['M']
    }
  })
  assert.equal(result.ok, true)
})

test('validateInquiryPlanPayload rejeita action sem input', () => {
  const result = validateInquiryPlanPayload({
    objective: 'Obj',
    hypotheses: ['H'],
    actions: [{ tool: 'processSourceTool', rationale: 'R', expectedOutput: 'E' }],
    successCriteria: ['S'],
    stopCriteria: ['X'],
    confidenceTarget: 0.8
  })
  assert.equal(result.ok, false)
})

test('validateInquiryPlanPayload aceita action com capability/custo/risco', () => {
  const result = validateInquiryPlanPayload({
    objective: 'Obj',
    hypotheses: ['H'],
    actions: [
      {
        tool: 'processSourceTool',
        capability: 'read',
        rationale: 'Ler contexto',
        expectedOutput: 'Resumo',
        riskLevel: 'low',
        estimatedCost: { tokens: 400, latencyMs: 900 },
        input: { subcommand: 'status' }
      }
    ],
    successCriteria: ['S'],
    stopCriteria: ['X'],
    confidenceTarget: 0.8
  })
  assert.equal(result.ok, true)
})

test('validateInquiryFinalPayload exige evidence nos findings', () => {
  const result = validateInquiryFinalPayload({
    scenario: 'positive',
    confidence: 0.91,
    conclusion: 'Conclusao baseada em evidencias',
    allegations: [{ id: 'allegation-a', statement: 'A' }],
    findings: [
      {
        id: 'finding-a',
        claim: 'C',
        status: 'verified',
        supportsAllegationIds: ['allegation-a'],
        evidence: [
          {
            source_id: 'doc-1',
            excerpt: 'trecho',
            location: { kind: 'pdf', page: 2 },
            confidence: 0.91,
            verification_status: 'verified'
          }
        ]
      }
    ]
  })
  assert.equal(result.ok, true)
})

test('validateInquiryFinalPayload aceita alias legado source/page', () => {
  const result = validateInquiryFinalPayload({
    scenario: 'negative',
    confidence: 0.66,
    conclusion: 'Pouca evidencia',
    allegations: [{ id: 'allegation-a', statement: 'A' }],
    findings: [
      {
        id: 'finding-a',
        claim: 'C',
        status: 'unverified',
        supportsAllegationIds: ['allegation-a'],
        evidence: [
          {
            source: 'legacy-doc',
            page: 7,
            excerpt: 'trecho antigo',
            confidence: 0.5,
            verification_status: 'weak'
          }
        ]
      }
    ]
  })
  assert.equal(result.ok, true)
})
