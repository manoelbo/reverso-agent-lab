import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import type { LabPaths } from '../src/core/paths.js'
import { runInquiryBatchConcurrent } from '../src/runner/inquiry-batch-runner.js'
import { verifyEvidenceItemWithMode } from '../src/core/evidence-semantic-verifier.js'
import { sanitizeForLlm } from '../src/core/sensitive-data-policy.js'
import {
  beginInquiryStage,
  createInquiryRunMetrics,
  endInquiryStage,
  finalizeInquiryMetrics,
  writeInquiryMetricsArtifact
} from '../src/core/inquiry-observability.js'

async function createFixture(): Promise<{ investigationDir: string; paths: LabPaths; eventsDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inquiry-p2-'))
  const sourceDir = path.join(root, 'source')
  const sourceArtifactsDir = path.join(sourceDir, '.artifacts')
  const investigationDir = path.join(root, 'investigation')
  const eventsDir = path.join(root, 'events')
  const docId = 'doc-1'
  await mkdir(path.join(sourceArtifactsDir, docId), { recursive: true })
  await mkdir(investigationDir, { recursive: true })
  await mkdir(eventsDir, { recursive: true })
  return {
    investigationDir,
    eventsDir,
    paths: {
      projectRoot: root,
      labRoot: root,
      filesystemDir: root,
      sourceDir,
      sourceArtifactsDir,
      inputDir: root,
      outputDir: root,
      eventsDir,
      dossierDir: path.join(root, 'dossier'),
      dossierPeopleDir: path.join(root, 'dossier', 'people'),
      dossierGroupsDir: path.join(root, 'dossier', 'groups'),
      dossierPlacesDir: path.join(root, 'dossier', 'places'),
      dossierTimelineDir: path.join(root, 'dossier', 'timeline'),
      investigationDir,
      leadsDir: path.join(investigationDir, 'leads'),
      allegationsDir: path.join(investigationDir, 'allegations'),
      findingsDir: path.join(investigationDir, 'findings'),
      notesDir: path.join(investigationDir, 'notes'),
      reportsDir: path.join(root, 'reports')
    }
  }
}

test('P2 integração: batch+lock, verificação hybrid, métricas e policy sensível', async () => {
  const fixture = await createFixture()
  const batch = await runInquiryBatchConcurrent({
    leads: ['lead-a', 'lead-a', 'lead-b', 'lead-c'],
    investigationDir: fixture.investigationDir,
    maxConcurrency: 2,
    runOne: async (slug) => {
      if (slug === 'lead-c') throw new Error('erro-controlado')
    }
  })
  assert.deepEqual(batch.succeededLeads, ['lead-a', 'lead-b'])
  assert.equal(batch.failedLeads.length, 1)
  assert.equal(batch.skippedLeads.length, 1)

  const verified = await verifyEvidenceItemWithMode({
    claim: 'há sobrepreço no contrato',
    evidence: {
      source_id: 'doc-1',
      source: 'doc-1',
      excerpt: 'sobrepreço no contrato',
      location: { kind: 'unknown' },
      confidence: 0.5,
      verification_status: 'weak'
    },
    paths: fixture.paths,
    minConfidence: 0.6,
    mode: 'hybrid',
    semanticProvider: async () => ({ score: 0.95, rationale: 'forte alinhamento' })
  })
  assert.equal(verified.verification_status, 'verified')
  assert.ok((verified.semantic_score ?? 0) > 0.9)

  const warnPolicy = sanitizeForLlm({
    text: 'Contato da fonte: sigilo@fonte.com',
    mode: 'warn',
    strategy: 'redact'
  })
  const strictPolicy = sanitizeForLlm({
    text: 'CPF 123.456.789-09',
    mode: 'strict',
    strategy: 'mask'
  })
  assert.equal(warnPolicy.blocked, false)
  assert.equal(strictPolicy.blocked, true)

  const metrics = createInquiryRunMetrics({
    runId: 'integration-p2',
    leadSlug: 'lead-a',
    evidenceVerificationMode: 'hybrid',
    sensitiveDataMode: 'warn',
    evidenceGateEnabled: true,
    preWriteValidationEnabled: true
  })
  beginInquiryStage(metrics, 'plan')
  endInquiryStage(metrics, 'plan', { outcome: 'ok' })
  beginInquiryStage(metrics, 'verify')
  endInquiryStage(metrics, 'verify', { outcome: 'ok' })
  finalizeInquiryMetrics({
    metrics,
    stopReason: 'goal_reached',
    parsedFindings: 2,
    persistedFindings: 1,
    reviewQueueFindings: 1,
    sensitiveOccurrences: warnPolicy.matches.length + strictPolicy.matches.length,
    sensitiveBlocked: strictPolicy.blocked,
    criticalWriteGateMode: 'approved'
  })
  const metricsPath = await writeInquiryMetricsArtifact({
    eventsDir: fixture.eventsDir,
    metrics
  })
  const persistedMetrics = JSON.parse(await readFile(metricsPath, 'utf8')) as {
    findings: { persisted: number }
    sensitiveData: { blocked: boolean }
  }
  assert.equal(persistedMetrics.findings.persisted, 1)
  assert.equal(persistedMetrics.sensitiveData.blocked, true)
})
