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
})
