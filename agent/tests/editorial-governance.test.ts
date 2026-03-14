import test from 'node:test'
import assert from 'node:assert/strict'
import { validateEditorialGovernanceTargets } from '../src/core/editorial-governance.js'
import { validateInquiryPreWrite } from '../src/core/pre-write-validation.js'
import type { LabPaths } from '../src/core/paths.js'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'

async function createFixturePaths(): Promise<LabPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gov-'))
  const filesystemDir = path.join(root, 'filesystem')
  const sourceDir = path.join(filesystemDir, 'source')
  await mkdir(sourceDir, { recursive: true })
  await writeFile(
    path.join(sourceDir, 'source-checkpoint.json'),
    JSON.stringify({ version: 1, files: [] }),
    'utf8'
  )
  return {
    projectRoot: root,
    labRoot: root,
    filesystemDir,
    sourceDir,
    sourceArtifactsDir: path.join(sourceDir, '.artifacts'),
    inputDir: path.join(root, 'input'),
    outputDir: filesystemDir,
    eventsDir: path.join(filesystemDir, 'events'),
    dossierDir: path.join(filesystemDir, 'dossier'),
    dossierPeopleDir: path.join(filesystemDir, 'dossier', 'people'),
    dossierGroupsDir: path.join(filesystemDir, 'dossier', 'groups'),
    dossierPlacesDir: path.join(filesystemDir, 'dossier', 'places'),
    dossierTimelineDir: path.join(filesystemDir, 'dossier', 'timeline'),
    investigationDir: path.join(filesystemDir, 'investigation'),
    leadsDir: path.join(filesystemDir, 'investigation', 'leads'),
    allegationsDir: path.join(filesystemDir, 'investigation', 'allegations'),
    findingsDir: path.join(filesystemDir, 'investigation', 'findings'),
    notesDir: path.join(filesystemDir, 'investigation', 'notes'),
    reportsDir: path.join(filesystemDir, 'reports')
  }
}

test('editorial-governance: strict bloqueia aprovado sem approver', () => {
  const result = validateEditorialGovernanceTargets(
    [
      {
        artifactType: 'finding',
        artifactId: 'f-1',
        governance: { editorial_status: 'approved' }
      }
    ],
    'strict'
  )
  assert.equal(result.ok, false)
  assert.ok(result.errors.some((item) => item.includes('approver')))
})

test('editorial-governance: soft nao bloqueia e retorna warnings acionaveis', () => {
  const result = validateEditorialGovernanceTargets(
    [{ artifactType: 'lead', artifactId: 'lead-1', governance: { editorial_status: 'published' } }],
    'soft'
  )
  assert.equal(result.ok, true)
  assert.ok(result.warnings.length > 0)
})

test('pre-write integra governanca editorial strict/non-strict', async () => {
  const paths = await createFixturePaths()
  const baseInput = {
    slug: 'x',
    allegations: [{ id: 'allegation-a', statement: 'A' }],
    findings: [],
    reviewQueue: [],
    paths,
    editorialGovernanceTargets: [{ artifactType: 'lead' as const, artifactId: 'lead-x', governance: { editorial_status: 'published' as const } }]
  }
  const strict = await validateInquiryPreWrite({
    ...baseInput,
    editorialGovernanceMode: 'strict'
  })
  const soft = await validateInquiryPreWrite({
    ...baseInput,
    editorialGovernanceMode: 'soft'
  })
  assert.equal(strict.ok, false)
  assert.equal(soft.ok, true)
  assert.ok(soft.warnings.length > 0)
})
