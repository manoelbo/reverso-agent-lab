import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decideAgentRoute,
  executeInquiryBatch,
  heuristicAgentIntent
} from '../src/runner/run-agent.js'
import type { DeepDiveSessionState } from '../src/core/deep-dive-session.js'

test('heuristicAgentIntent identifica deep-dive', () => {
  const intent = heuristicAgentIntent('analise as fontes e sugira leads')
  assert.equal(intent.intent, 'start_deep_dive')
})

test('heuristicAgentIntent identifica inquiry com slug', () => {
  const intent = heuristicAgentIntent('executa inquiry do lead contrato-cafe')
  assert.equal(intent.intent, 'run_inquiry')
  assert.equal(intent.targetSlug, 'contrato-cafe')
})

test('decideAgentRoute prioriza sessao deep-dive ativa', async () => {
  const session: DeepDiveSessionState = {
    stage: 'awaiting_plan_decision',
    reportPath: 'lab/agent/filesystem/reports/deep-dive-x.md',
    suggestedLeads: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  const route = await decideAgentRoute({
    text: 'faz o plano de todos',
    session,
    hasAgentContext: true,
    leads: [],
    model: 'test-model',
    apiKey: 'test-key'
  })
  assert.equal(route.kind, 'deep_dive_next')
})

test('decideAgentRoute pede clarificacao para continue_session sem sessao ativa', async () => {
  const route = await decideAgentRoute({
    text: 'faz o plano de todos',
    hasAgentContext: true,
    leads: [],
    model: 'test-model',
    apiKey: 'test-key'
  })
  assert.equal(route.kind, 'deep_dive')
})

test('decideAgentRoute resolve inquiry por indice quando houver lead correspondente', async () => {
  const route = await decideAgentRoute({
    text: 'executa inquiry do lead 2',
    hasAgentContext: true,
    leads: [
      { slug: 'lead-um', title: 'Lead Um', description: 'd1', status: 'planned' },
      { slug: 'lead-dois', title: 'Lead Dois', description: 'd2', status: 'planned' }
    ],
    model: 'test-model',
    apiKey: 'test-key'
  })
  assert.equal(route.kind, 'execute_inquiry')
  if (route.kind !== 'execute_inquiry') {
    assert.fail('Rota deveria ser execute_inquiry')
  }
  assert.equal(route.leads[0]?.slug, 'lead-dois')
})

test('heuristicAgentIntent identifica investigacao em lote', () => {
  const intent = heuristicAgentIntent('pode fazer a investigacao dos 3 leads')
  assert.equal(intent.intent, 'run_inquiry')
  assert.equal(intent.targetScope, 'all')
})

test('decideAgentRoute executa inquiry em lote sem sessao ativa quando houver leads planned', async () => {
  const route = await decideAgentRoute({
    text: 'pode fazer a investigacao dos 3 leads',
    hasAgentContext: true,
    leads: [
      { slug: 'lead-um', title: 'Lead Um', description: 'd1', status: 'planned' },
      { slug: 'lead-dois', title: 'Lead Dois', description: 'd2', status: 'planned' },
      { slug: 'lead-tres', title: 'Lead Tres', description: 'd3', status: 'planned' }
    ],
    model: 'test-model',
    apiKey: 'test-key'
  })
  assert.equal(route.kind, 'execute_inquiry')
  if (route.kind !== 'execute_inquiry') {
    assert.fail('Rota deveria ser execute_inquiry')
  }
  assert.equal(route.leads.length, 3)
})

test('decideAgentRoute mapeia pedido de contexto para init', async () => {
  const route = await decideAgentRoute({
    text: 'olhe minhas fontes e me de contexto',
    hasAgentContext: true,
    leads: [],
    model: 'test-model',
    apiKey: 'test-key'
  })
  assert.equal(route.kind, 'init')
})

test('executeInquiryBatch continua apos falha de um lead', async () => {
  const executed: string[] = []
  const result = await executeInquiryBatch({
    leads: ['lead-1', 'lead-2', 'lead-3'],
    runOne: async (slug) => {
      executed.push(slug)
      if (slug === 'lead-2') {
        throw new Error('contract validation failed')
      }
    }
  })
  assert.deepEqual(executed, ['lead-1', 'lead-2', 'lead-3'])
  assert.deepEqual(result.succeededLeads, ['lead-1', 'lead-3'])
  assert.equal(result.failedLeads.length, 1)
  assert.equal(result.failedLeads[0]?.slug, 'lead-2')
})

