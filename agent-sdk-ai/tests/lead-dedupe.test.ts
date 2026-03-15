import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dedupeLeadCandidates } from '../src/lib/lead-dedupe'

describe('dedupeLeadCandidates', () => {
  it('detecta duplicidade exata por título', () => {
    const result = dedupeLeadCandidates(
      [{ title: 'Fraude em licitação de obras públicas' }],
      [{ slug: 'licitacao-obras', title: 'Fraude em licitação de obras públicas' }]
    )

    assert.equal(result[0]?.duplicated, true)
    assert.equal(result[0]?.matchedWith, 'licitacao-obras')
  })

  it('não marca duplicado quando títulos são distintos', () => {
    const result = dedupeLeadCandidates(
      [{ title: 'Contratação emergencial de tecnologia' }],
      [{ slug: 'saude-publica', title: 'Irregularidades em contratos de saúde' }]
    )

    assert.equal(result[0]?.duplicated, false)
  })
})
