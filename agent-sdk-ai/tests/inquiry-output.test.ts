import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseInquiryPanelData } from '../src/lib/inquiry-output'

describe('parseInquiryPanelData', () => {
  it('retorna estrutura de painel quando output é válido', () => {
    const result = parseInquiryPanelData({
      lead: 'fraude-obras',
      evidenceGate: {
        verifiedFindings: 2,
        reviewQueue: 1,
      },
      inquirySummary: {
        allegations: [{ id: 'a1', statement: 'Alegação 1' }],
        verifiedFindings: [{ id: 'f1', claim: 'Finding verificado' }],
        reviewFindings: [{ id: 'f2', claim: 'Finding em revisão' }],
      },
    })

    assert.ok(result)
    assert.equal(result?.lead, 'fraude-obras')
    assert.equal(result?.verifiedFindingsCount, 2)
    assert.equal(result?.reviewQueueCount, 1)
    assert.equal(result?.allegations.length, 1)
    assert.equal(result?.verifiedItems.length, 1)
    assert.equal(result?.reviewItems.length, 1)
  })

  it('retorna undefined quando evidenceGate não existe', () => {
    const result = parseInquiryPanelData({
      lead: 'x',
    })
    assert.equal(result, undefined)
  })

  it('usa fallback de contagem com base nas listas quando gate não informa números', () => {
    const result = parseInquiryPanelData({
      lead: 'lead-x',
      evidenceGate: {},
      inquirySummary: {
        allegations: [
          { id: 'a1', statement: 'A1' },
          { id: '', statement: 'inválida' },
        ],
        verifiedFindings: [
          { id: 'f1', claim: 'F1' },
          { id: 'f2', claim: 'F2' },
        ],
        reviewFindings: [{ id: 'r1', claim: 'R1' }],
      },
    })

    assert.ok(result)
    assert.equal(result?.verifiedFindingsCount, 2)
    assert.equal(result?.reviewQueueCount, 1)
    assert.equal(result?.allegations.length, 1)
    assert.equal(result?.verifiedItems.length, 2)
    assert.equal(result?.reviewItems.length, 1)
  })
})
