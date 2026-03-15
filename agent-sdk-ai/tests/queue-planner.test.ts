import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildQueuePlan } from '../src/agent/queue-planner'

describe('buildQueuePlan', () => {
  it('monta sequência com preflight + intenção final', () => {
    const plan = buildQueuePlan({
      preflight: ['Processar PDFs pendentes', 'Executar init automático'],
      intent: 'deep_dive',
    })

    assert.deepEqual(plan.steps, [
      'Processar PDFs pendentes',
      'Executar init automático',
      'Atender intenção: deep_dive',
    ])
    assert.equal(plan.totalSteps, 3)
  })

  it('remove itens vazios e preserva etapa final', () => {
    const plan = buildQueuePlan({
      preflight: ['  ', 'Sem bloqueios de pré-fluxo.'],
      intent: 'quick_research',
    })

    assert.deepEqual(plan.steps, [
      'Sem bloqueios de pré-fluxo.',
      'Atender intenção: quick_research',
    ])
    assert.equal(plan.totalSteps, 2)
  })
})
