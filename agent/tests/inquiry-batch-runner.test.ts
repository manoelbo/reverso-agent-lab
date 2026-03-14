import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { runInquiryBatchConcurrent } from '../src/runner/inquiry-batch-runner.js'

async function createInvestigationDir(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inquiry-batch-'))
  const investigationDir = path.join(root, 'investigation')
  await mkdir(investigationDir, { recursive: true })
  return investigationDir
}

test('runInquiryBatchConcurrent respeita limite de concorrencia', async () => {
  const investigationDir = await createInvestigationDir()
  let active = 0
  let maxObserved = 0
  const holdMs = 40

  const result = await runInquiryBatchConcurrent({
    leads: ['a', 'b', 'c'],
    investigationDir,
    maxConcurrency: 2,
    runOne: async () => {
      active += 1
      maxObserved = Math.max(maxObserved, active)
      await new Promise((resolve) => setTimeout(resolve, holdMs))
      active -= 1
    }
  })

  assert.equal(maxObserved, 2)
  assert.deepEqual(result.failedLeads, [])
  assert.deepEqual(result.skippedLeads, [])
  assert.deepEqual(result.succeededLeads, ['a', 'b', 'c'])
})

test('runInquiryBatchConcurrent pula lead duplicado com resumo deterministico', async () => {
  const investigationDir = await createInvestigationDir()
  const result = await runInquiryBatchConcurrent({
    leads: ['alpha', 'beta', 'alpha'],
    investigationDir,
    maxConcurrency: 3,
    runOne: async () => undefined
  })
  assert.deepEqual(result.succeededLeads, ['alpha', 'beta'])
  assert.equal(result.failedLeads.length, 0)
  assert.equal(result.skippedLeads.length, 1)
  assert.equal(result.skippedLeads[0]?.slug, 'alpha')
  assert.match(result.skippedLeads[0]?.reason ?? '', /duplicate_lead_in_batch/)
})

test('runInquiryBatchConcurrent tolera falha parcial sem abortar lote', async () => {
  const investigationDir = await createInvestigationDir()
  const result = await runInquiryBatchConcurrent({
    leads: ['ok-1', 'boom', 'ok-2'],
    investigationDir,
    maxConcurrency: 2,
    runOne: async (slug) => {
      if (slug === 'boom') throw new Error('falha-controlada')
    }
  })
  assert.deepEqual(result.succeededLeads, ['ok-1', 'ok-2'])
  assert.equal(result.failedLeads.length, 1)
  assert.equal(result.failedLeads[0]?.slug, 'boom')
  assert.match(result.failedLeads[0]?.message ?? '', /falha-controlada/)
})

test('runInquiryBatchConcurrent preserva ordenacao de falhas mesmo com duracoes diferentes', async () => {
  const investigationDir = await createInvestigationDir()
  const result = await runInquiryBatchConcurrent({
    leads: ['lento', 'rapido'],
    investigationDir,
    maxConcurrency: 2,
    runOne: async (slug) => {
      if (slug === 'lento') {
        await new Promise((resolve) => setTimeout(resolve, 30))
        throw new Error('erro-lento')
      }
      throw new Error('erro-rapido')
    }
  })
  assert.deepEqual(
    result.failedLeads.map((item) => item.slug),
    ['lento', 'rapido']
  )
})
