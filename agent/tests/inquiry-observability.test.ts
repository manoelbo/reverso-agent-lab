import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile } from 'node:fs/promises'
import {
  beginInquiryStage,
  createInquiryRunMetrics,
  endInquiryStage,
  finalizeInquiryMetrics,
  recordInquiryRetry,
  writeInquiryMetricsArtifact
} from '../src/core/inquiry-observability.js'

test('inquiry observability agrega estágios, retries e persiste artefato', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inquiry-observability-'))
  const metrics = createInquiryRunMetrics({
    runId: 'run-1',
    leadSlug: 'lead-a',
    evidenceVerificationMode: 'hybrid',
    sensitiveDataMode: 'warn',
    evidenceGateEnabled: true,
    preWriteValidationEnabled: true
  })
  beginInquiryStage(metrics, 'plan')
  recordInquiryRetry(metrics, 'plan')
  endInquiryStage(metrics, 'plan', { outcome: 'ok' })
  beginInquiryStage(metrics, 'verify')
  endInquiryStage(metrics, 'verify', { outcome: 'skipped', details: 'no_evidence' })
  finalizeInquiryMetrics({
    metrics,
    stopReason: 'insufficient_evidence',
    parsedFindings: 3,
    persistedFindings: 1,
    reviewQueueFindings: 2,
    sensitiveOccurrences: 4,
    sensitiveBlocked: false,
    criticalWriteGateMode: 'approved'
  })
  const filePath = await writeInquiryMetricsArtifact({
    eventsDir: root,
    metrics
  })
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as {
    retries: { total: number; byStage: { plan: number } }
    findings: { persisted: number; reviewQueue: number }
    sensitiveData: { occurrences: number; blocked: boolean }
    stageMetrics: Array<{ stage: string; outcome: string }>
  }
  assert.equal(parsed.retries.total, 1)
  assert.equal(parsed.retries.byStage.plan, 1)
  assert.equal(parsed.findings.persisted, 1)
  assert.equal(parsed.findings.reviewQueue, 2)
  assert.equal(parsed.sensitiveData.occurrences, 4)
  assert.equal(parsed.sensitiveData.blocked, false)
  assert.deepEqual(
    parsed.stageMetrics.map((item) => `${item.stage}:${item.outcome}`),
    ['plan:ok', 'verify:skipped']
  )
})
