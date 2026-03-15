import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLeadPayloadSchema,
  inquiryFinalPayloadSchema,
  parseStrictJson,
} from '../src/lib/contracts'

describe('contracts schemas', () => {
  it('valida create lead payload', () => {
    const payload = {
      codename: 'obra-fantasma',
      title: 'Obra fantasma em contrato municipal',
      description: 'Hipótese de execução parcial com pagamento integral.',
      inquiryPlan: {
        formulateAllegations: ['Pagamento integral sem entrega'],
        defineSearchStrategy: ['Checar medições e notas de empenho'],
        gatherFindings: ['Coletar evidências em relatórios e aditivos'],
        mapToAllegations: ['Relacionar evidência com cada alegação'],
      },
    }

    const parsed = createLeadPayloadSchema.safeParse(payload)
    assert.equal(parsed.success, true)
  })

  it('faz parse estrito de JSON fenced', () => {
    const parsed = parseStrictJson('```json\n{"ok":true}\n```') as { ok: boolean }
    assert.equal(parsed.ok, true)
  })

  it('valida inquiry final payload mínimo', () => {
    const payload = {
      scenario: 'positive',
      confidence: 0.78,
      conclusion: 'Há base suficiente para continuidade da investigação.',
      allegations: [{ id: 'a1', statement: 'Favorecimento indevido' }],
      findings: [
        {
          id: 'f1',
          claim: 'A empresa vencedora tinha relação prévia com agente público',
          status: 'verified',
          supportsAllegationIds: ['a1'],
          evidence: [
            {
              source_id: 'doc-1',
              source: 'doc-1',
              excerpt: 'trecho',
              location: { kind: 'pdf', page: 12 },
              confidence: 0.9,
              verification_status: 'verified',
            },
          ],
        },
      ],
    }

    const parsed = inquiryFinalPayloadSchema.safeParse(payload)
    assert.equal(parsed.success, true)
  })
})
