import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { LabPaths } from '../src/core/paths.js'
import { verifyEvidenceItem } from '../src/core/evidence-verifier.js'
import { verifyEvidenceItemWithMode } from '../src/core/evidence-semantic-verifier.js'

async function createFixture(): Promise<{ paths: LabPaths; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evidence-semantic-'))
  const sourceDir = path.join(root, 'source')
  const artifactsDir = path.join(sourceDir, '.artifacts')
  const investigationDir = path.join(root, 'investigation')
  const docId = 'doc-1'
  const sourcePath = path.join(sourceDir, 'memo.md')
  await mkdir(sourceDir, { recursive: true })
  await mkdir(artifactsDir, { recursive: true })
  await mkdir(path.join(artifactsDir, docId), { recursive: true })
  await mkdir(investigationDir, { recursive: true })
  await writeFile(sourcePath, 'Há contrato milionário com sobrepreço evidente.', 'utf8')
  await writeFile(path.join(artifactsDir, docId, 'preview.md'), 'preview', 'utf8')
  await writeFile(
    path.join(sourceDir, 'source-checkpoint.json'),
    JSON.stringify({
      version: 1,
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
  return {
    paths: {
      projectRoot: root,
      labRoot: root,
      filesystemDir: root,
      sourceDir,
      sourceArtifactsDir: artifactsDir,
      inputDir: root,
      outputDir: root,
      eventsDir: path.join(root, 'events'),
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
    },
    cleanup: async () => rm(root, { recursive: true, force: true })
  }
}

test('modo lexical preserva baseline do verificador atual', async () => {
  const fixture = await createFixture()
  try {
    const evidence = {
      source_id: 'doc-1',
      source: 'doc-1',
      excerpt: 'contrato milionário com sobrepreço',
      location: { kind: 'unknown' as const },
      confidence: 0.9,
      verification_status: 'weak' as const
    }
    const legacy = await verifyEvidenceItem({
      evidence,
      paths: fixture.paths,
      minConfidence: 0.6
    })
    const lexical = await verifyEvidenceItemWithMode({
      claim: 'há sobrepreço',
      evidence,
      paths: fixture.paths,
      minConfidence: 0.6,
      mode: 'lexical'
    })
    assert.deepEqual(lexical, legacy)
  } finally {
    await fixture.cleanup()
  }
})

test('modo semantic usa score semântico e rationale', async () => {
  const fixture = await createFixture()
  try {
    const result = await verifyEvidenceItemWithMode({
      claim: 'empresa vencedora superfaturou o contrato',
      evidence: {
        source_id: 'doc-1',
        source: 'doc-1',
        excerpt: 'sobrepreço evidente no contrato',
        location: { kind: 'unknown' },
        confidence: 0.2,
        verification_status: 'weak'
      },
      paths: fixture.paths,
      minConfidence: 0.7,
      mode: 'semantic',
      semanticProvider: async () => ({ score: 0.9, rationale: 'similaridade alta' })
    })
    assert.equal(result.verification_status, 'verified')
    assert.equal(result.semantic_score, 0.9)
    assert.match(result.verification_rationale ?? '', /similaridade alta/)
  } finally {
    await fixture.cleanup()
  }
})

test('modo hybrid combina sinais lexical + semantic', async () => {
  const fixture = await createFixture()
  try {
    const result = await verifyEvidenceItemWithMode({
      claim: 'sobrepreço no contrato',
      evidence: {
        source_id: 'doc-1',
        source: 'doc-1',
        excerpt: 'sobrepreço evidente no contrato',
        location: { kind: 'unknown' },
        confidence: 0.4,
        verification_status: 'weak'
      },
      paths: fixture.paths,
      minConfidence: 0.6,
      mode: 'hybrid',
      semanticProvider: async () => ({ score: 0.9 })
    })
    assert.equal(result.verification_status, 'verified')
    assert.ok((result.confidence ?? 0) >= 0.6)
  } finally {
    await fixture.cleanup()
  }
})
