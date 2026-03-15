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

  it('detecta atualização de contexto', () => {
    const decision = heuristicIntent('atualiza o agent.md com foco em contratos emergenciais')
    assert.ok(decision)
    assert.equal(decision.intent, 'update_agent_context')
  })

  it('detecta criação de lead por hipótese', () => {
    const decision = heuristicIntent('cria lead para hipótese de sobrepreço na obra')
    assert.ok(decision)
    assert.equal(decision.intent, 'create_lead')
  })

  it('detecta inquiry explícito', () => {
    const decision = heuristicIntent('execute inquiry no lead fraude-obras')
    assert.ok(decision)
    assert.equal(decision.intent, 'run_inquiry')
  })

  it('detecta pedido de resumo como quick research', () => {
    const decision = heuristicIntent('resuma os pontos principais')
    assert.ok(decision)
    assert.equal(decision.intent, 'quick_research')
  })
})
