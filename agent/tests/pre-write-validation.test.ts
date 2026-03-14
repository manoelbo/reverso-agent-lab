import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { validateInquiryPreWrite } from '../src/core/pre-write-validation.js'
import type { LabPaths } from '../src/core/paths.js'

async function createPathsFixture(): Promise<LabPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'prewrite-'))
  const filesystemDir = path.join(root, 'filesystem')
  const sourceDir = path.join(filesystemDir, 'source')
  const sourceArtifactsDir = path.join(sourceDir, '.artifacts')
  const investigationDir = path.join(filesystemDir, 'investigation')
  await mkdir(sourceArtifactsDir, { recursive: true })
  await mkdir(path.join(investigationDir, 'leads'), { recursive: true })
  await writeFile(
    path.join(sourceDir, 'source-checkpoint.json'),
    JSON.stringify({
      version: 1,
      sourceDir,
      updatedAt: new Date().toISOString(),
      files: [{ docId: 'doc-1', originalFileName: 'arquivo-1.pdf' }]
    }),
    'utf8'
  )
  return {
    projectRoot: root,
    labRoot: root,
    filesystemDir,
    sourceDir,
    sourceArtifactsDir,
    inputDir: path.join(root, 'input'),
    outputDir: filesystemDir,
    eventsDir: path.join(filesystemDir, 'events'),
    dossierDir: path.join(filesystemDir, 'dossier'),
    dossierPeopleDir: path.join(filesystemDir, 'dossier', 'people'),
    dossierGroupsDir: path.join(filesystemDir, 'dossier', 'groups'),
    dossierPlacesDir: path.join(filesystemDir, 'dossier', 'places'),
    dossierTimelineDir: path.join(filesystemDir, 'dossier', 'timeline'),
    investigationDir,
    leadsDir: path.join(investigationDir, 'leads'),
    allegationsDir: path.join(investigationDir, 'allegations'),
    findingsDir: path.join(investigationDir, 'findings'),
    notesDir: path.join(investigationDir, 'notes'),
    reportsDir: path.join(filesystemDir, 'reports')
  }
}

test('validateInquiryPreWrite bloqueia referência inválida de allegation', async () => {
  const paths = await createPathsFixture()
  const result = await validateInquiryPreWrite({
    slug: 'lead-teste',
    allegations: [{ id: 'allegation-a', statement: 'Alegação A' }],
    findings: [
      {
        id: 'finding-a',
        claim: 'Claim A',
        supportsAllegationIds: ['allegation-inexistente'],
        evidence: [
          {
            source_id: 'doc-1',
            source: 'doc-1',
            excerpt: 'trecho',
            location: { kind: 'pdf', page: 2 },
            confidence: 0.8,
            verification_status: 'verified'
          }
        ]
      }
    ],
    reviewQueue: [],
    expectedLanguage: 'pt',
    paths
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((item) => item.includes('referencia allegation inexistente')))
})

test('validateInquiryPreWrite aceita payload válido e alerta source desconhecido', async () => {
  const paths = await createPathsFixture()
  const result = await validateInquiryPreWrite({
    slug: 'lead-teste',
    allegations: [{ id: 'allegation-a', statement: 'Alegação A' }],
    findings: [
      {
        id: 'finding-a',
        claim: 'Claim A',
        supportsAllegationIds: ['allegation-a'],
        evidence: [
          {
            source_id: 'doc-desconhecido',
            source: 'doc-desconhecido',
            excerpt: 'trecho',
            location: { kind: 'pdf', page: 2 },
            confidence: 0.8,
            verification_status: 'verified'
          }
        ]
      }
    ],
    reviewQueue: [],
    expectedLanguage: 'pt',
    paths
  })
  assert.equal(result.ok, true)
  assert.ok(result.warnings.some((item) => item.includes('source_id não encontrado')))
})

