import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { runAgentLoop } from '../src/core/agent-loop.js'
import { buildNoProgressRecommendation } from '../src/runner/run-inquiry.js'
import { createPolicyComplianceHooks } from '../src/core/compliance-hooks.js'

test('runAgentLoop encerra com goal_reached em acao valida', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'agent-loop-'))
  const filePath = path.join(tmpDir, 'doc.md')
  await writeFile(filePath, '# Documento\n\nSem conexoes ainda.\n', 'utf8')

  const result = await runAgentLoop({
    actions: [
      {
        tool: 'linkEntities',
        input: { filePath, entities: ['Empresa X'] }
      }
    ],
    ctx: { paths: {} as never },
    maxSteps: 3
  })

  assert.equal(result.stopReason, 'goal_reached')
  assert.equal(result.failures, 0)
  assert.equal(result.usage.toolCalls, 1)
})

test('runAgentLoop encerra com tool_error quando input da tool e invalido', async () => {
  const result = await runAgentLoop({
    actions: [
      {
        tool: 'linkEntities',
        input: {}
      }
    ],
    ctx: { paths: {} as never },
    maxSteps: 3
  })

  assert.equal(result.stopReason, 'tool_error')
  assert.equal(result.failures, 1)
  assert.equal(result.steps.length, 1)
})

test('runAgentLoop interrompe loop degenerado com no_progress apos repeticao', async () => {
  const result = await runAgentLoop({
    actions: [
      { tool: 'linkEntities', input: {} },
      { tool: 'linkEntities', input: {} },
      { tool: 'linkEntities', input: {} }
    ],
    ctx: { paths: {} as never },
    maxSteps: 6,
    verifier: () => ({
      ok: true,
      confidence: 0.2,
      reason: 'progress_observed',
      gaps: []
    })
  })

  assert.equal(result.stopReason, 'no_progress')
  assert.equal(result.steps.length, 2)
})

test('no_progress possui recomendacao operacional para camada de produto', () => {
  const recommendation = buildNoProgressRecommendation()
  assert.match(recommendation.toLowerCase(), /reexecute inquiry/)
})

test('runAgentLoop emite telemetria de tool_result com retryCount', async () => {
  const toolResults: Array<{ retryCount: number; errorCode?: string }> = []
  const result = await runAgentLoop({
    actions: [
      {
        tool: 'processSourceTool',
        input: { subcommand: 'subcommand-invalido' as unknown as 'queue-status' }
      }
    ],
    ctx: { paths: {} as never },
    maxSteps: 3,
    hooks: {
      onToolResult: ({ retryCount, errorCode }) => {
        toolResults.push({ retryCount, ...(errorCode ? { errorCode } : {}) })
      }
    }
  })

  assert.equal(toolResults.length, 1)
  assert.equal(typeof toolResults[0]?.retryCount, 'number')
  assert.ok((toolResults[0]?.retryCount ?? 0) <= 1)
  assert.equal(result.steps.length, 1)
})

test('runAgentLoop bloqueia por compliance deny com stop_reason auditavel', async () => {
  const decisions: string[] = []
  const result = await runAgentLoop({
    actions: [
      {
        tool: 'linkEntities',
        input: { filePath: '/tmp/nao-importa.md' }
      }
    ],
    ctx: { paths: {} as never },
    compliance: createPolicyComplianceHooks({
      defaultDecision: 'allow',
      byCapability: { persist: 'deny' }
    }),
    hooks: {
      onComplianceDecision: ({ phase, decision }) => {
        decisions.push(`${phase}:${decision}`)
      }
    }
  })
  assert.equal(result.stopReason, 'compliance_denied')
  assert.ok(decisions.includes('pre:deny'))
  assert.equal(result.steps.length, 1)
})
