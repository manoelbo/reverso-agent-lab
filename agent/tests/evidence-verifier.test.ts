import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import type { LabPaths } from '../src/core/paths.js'
import { verifyEvidenceItem } from '../src/core/evidence-verifier.js'

async function createFixture(): Promise<{ paths: LabPaths; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-gate-'))
  const sourceDir = path.join(root, 'source')
  const artifactsDir = path.join(sourceDir, '.artifacts')
  const investigationDir = path.join(root, 'investigation')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(artifactsDir, { recursive: true })
  await mkdir(investigationDir, { recursive: true })

  const docId = 'doc-md'
  const sourcePath = path.join(sourceDir, 'memo.md')
  await writeFile(
    sourcePath,
    ['Linha 1', 'Trecho principal com prova objetiva e data 2024.', 'Linha 3'].join('\n'),
    'utf8'
  )
  await mkdir(path.join(artifactsDir, docId), { recursive: true })
  await writeFile(path.join(artifactsDir, docId, 'preview.md'), 'Preview fallback', 'utf8')
  await writeFile(
    path.join(sourceDir, 'source-checkpoint.json'),
    JSON.stringify({
      version: 1,
      sourceDir,
      files: [
        {
          docId,
          originalFileName: 'memo.md',
          sourcePath,
          fileType: 'md',
          artifactDir: path.join(artifactsDir, docId)
        }
      ]
    }),
    'utf8'
  )

  const paths: LabPaths = {
    projectRoot: root,
    labRoot: root,
    filesystemDir: root,
    sourceDir,
    sourceArtifactsDir: artifactsDir,
    inputDir: root,
    outputDir: root,
    eventsDir: path.join(root, 'events'),
    dossierDir: path.join(root, 'dossier'),
    dossierPeopleDir: path.join(root, 'dossier/people'),
    dossierGroupsDir: path.join(root, 'dossier/groups'),
    dossierPlacesDir: path.join(root, 'dossier/places'),
    dossierTimelineDir: path.join(root, 'dossier/timeline'),
    investigationDir,
    leadsDir: path.join(investigationDir, 'leads'),
    allegationsDir: path.join(investigationDir, 'allegations'),
    findingsDir: path.join(investigationDir, 'findings'),
    notesDir: path.join(investigationDir, 'notes'),
    reportsDir: path.join(root, 'reports')
  }
  return { paths, cleanup: () => rm(root, { recursive: true, force: true }) }
}

test('verifyEvidenceItem marca evidence como verified quando match e confidence suficientes', async () => {
  const fixture = await createFixture()
  try {
    const result = await verifyEvidenceItem({
      paths: fixture.paths,
      minConfidence: 0.7,
      evidence: {
        source_id: 'doc-md',
        source: 'doc-md',
        excerpt: 'Trecho principal com prova objetiva',
        location: { kind: 'unknown' },
        confidence: 0.9,
        verification_status: 'weak'
      }
    })
    assert.equal(result.verification_status, 'verified')
    assert.equal(result.location.kind, 'text')
  } finally {
    await fixture.cleanup()
  }
})

test('verifyEvidenceItem marca evidence como missing quando source nao existe', async () => {
  const fixture = await createFixture()
  try {
    const result = await verifyEvidenceItem({
      paths: fixture.paths,
      minConfidence: 0.7,
      evidence: {
        source_id: 'nao-existe',
        source: 'nao-existe',
        excerpt: 'texto',
        location: { kind: 'unknown' },
        confidence: 0.8,
        verification_status: 'weak'
      }
    })
    assert.equal(result.verification_status, 'missing')
  } finally {
    await fixture.cleanup()
  }
})

test('verifyEvidenceItem marca evidence como weak para confidence baixa', async () => {
  const fixture = await createFixture()
  try {
    const result = await verifyEvidenceItem({
      paths: fixture.paths,
      minConfidence: 0.95,
      evidence: {
        source_id: 'doc-md',
        source: 'doc-md',
        excerpt: 'Trecho principal com prova objetiva',
        location: { kind: 'unknown' },
        confidence: 0.4,
        verification_status: 'weak'
      }
    })
    assert.equal(result.verification_status, 'weak')
  } finally {
    await fixture.cleanup()
  }
})
