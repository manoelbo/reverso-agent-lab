import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkflowGuidance } from '../src/agent/workflow-engine'

describe('buildWorkflowGuidance', () => {
  it('prioriza sessão deep-dive ativa', () => {
    const guidance = buildWorkflowGuidance({
      intent: {
        intent: 'quick_research',
        confidence: 0.8,
        reason: 'pergunta',
      },
      session: {
        stage: 'awaiting_plan_decision',
      },
      state: {
        sourceEmpty: false,
        unprocessedFiles: [],
        processedFiles: [{ docId: 'a', fileName: 'a.pdf' }],
        failedFiles: [],
        totalSourceFiles: 1,
        hasAgentContext: true,
        hasPreviewsWithoutInit: false,
        isFirstVisit: false,
        leadsCount: 1,
      },
    })

    assert.equal(guidance.shouldPrioritizeDeepDiveSession, true)
    assert.ok(
      guidance.preflight.some((line) => line.includes('sessão deep-dive ativa'))
    )
  })

  it('enfileira processamento quando há pendências', () => {
    const guidance = buildWorkflowGuidance({
      intent: {
        intent: 'run_inquiry',
        confidence: 0.9,
        reason: 'pedido',
      },
      session: undefined,
      state: {
        sourceEmpty: false,
        unprocessedFiles: [{ docId: 'pendente', fileName: 'x.pdf' }],
        processedFiles: [],
        failedFiles: [],
        totalSourceFiles: 1,
        hasAgentContext: false,
        hasPreviewsWithoutInit: false,
        isFirstVisit: true,
        leadsCount: 0,
      },
    })

    assert.ok(guidance.preflight.some((line) => line.includes('processamento')))
  })

  it('orienta upload quando source está vazio para intenção investigativa', () => {
    const guidance = buildWorkflowGuidance({
      intent: {
        intent: 'deep_dive',
        confidence: 0.88,
        reason: 'pedido investigativo',
      },
      session: undefined,
      state: {
        sourceEmpty: true,
        unprocessedFiles: [],
        processedFiles: [],
        failedFiles: [],
        totalSourceFiles: 0,
        hasAgentContext: false,
        hasPreviewsWithoutInit: false,
        isFirstVisit: true,
        leadsCount: 0,
      },
    })

    assert.ok(guidance.preflight.some((line) => line.includes('base de fontes está vazia')))
  })

  it('enfileira init quando previews existem sem agent.md', () => {
    const guidance = buildWorkflowGuidance({
      intent: {
        intent: 'quick_research',
        confidence: 0.74,
        reason: 'pergunta',
      },
      session: undefined,
      state: {
        sourceEmpty: false,
        unprocessedFiles: [],
        processedFiles: [{ docId: 'p', fileName: 'p.pdf' }],
        failedFiles: [],
        totalSourceFiles: 1,
        hasAgentContext: false,
        hasPreviewsWithoutInit: true,
        isFirstVisit: false,
        leadsCount: 0,
      },
    })

    assert.ok(guidance.preflight.some((line) => line.includes('Execute initContext')))
  })
})
