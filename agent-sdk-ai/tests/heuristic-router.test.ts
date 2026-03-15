import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { heuristicIntent } from '../src/agent/router'

describe('heuristicIntent', () => {
  it('detecta saudação', () => {
    const decision = heuristicIntent('Oi, tudo bem?')
    assert.ok(decision)
    assert.equal(decision.intent, 'greeting')
  })

  it('detecta processamento de documentos', () => {
    const decision = heuristicIntent('processa esses PDFs para mim')
    assert.ok(decision)
    assert.equal(decision.intent, 'process_documents')
  })

  it('detecta consulta de dados', () => {
    const decision = heuristicIntent('quais leads já existem?')
    assert.ok(decision)
    assert.equal(decision.intent, 'view_data')
  })
})
