import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { LabPaths } from '../src/core/paths.js'
import {
  createSession,
  loadActiveSession,
  loadSession,
  setActiveSession
} from '../src/core/deep-dive-session-store.js'

function buildLabPaths(root: string): LabPaths {
  const filesystemDir = path.join(root, 'filesystem')
  return {
    projectRoot: root,
    labRoot: path.join(root, 'lab', 'agent'),
    filesystemDir,
    sourceDir: path.join(filesystemDir, 'source'),
    sourceArtifactsDir: path.join(filesystemDir, 'source', '.artifacts'),
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

test('deep-dive-session-store cria sessao e recupera por ponteiro ativo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-session-store-'))
  const paths = buildLabPaths(root)
  const now = new Date().toISOString()

  const created = await createSession(
    paths,
    {
      stage: 'awaiting_plan_decision',
      reportPath: 'reports/deep-dive-1.md',
      suggestedLeads: [],
      createdAt: now,
      updatedAt: now
    },
    'sessao-principal'
  )

  const byId = await loadSession(paths, created.sessionId)
  const active = await loadActiveSession(paths)
  assert.equal(byId?.sessionId, 'sessao-principal')
  assert.equal(active?.sessionId, 'sessao-principal')
  assert.equal(active?.stage, 'awaiting_plan_decision')

  await rm(root, { recursive: true, force: true })
})

test('deep-dive-session-store faz fallback para sessao legada', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-session-legacy-'))
  const paths = buildLabPaths(root)
  const now = new Date().toISOString()
  const legacyPath = path.join(paths.filesystemDir, 'deep-dive-session.json')
  await mkdir(paths.filesystemDir, { recursive: true })
  await writeFile(
    legacyPath,
    JSON.stringify(
      {
        stage: 'awaiting_inquiry_execution',
        reportPath: 'reports/legacy.md',
        suggestedLeads: [],
        createdAt: now,
        updatedAt: now
      },
      null,
      2
    )
  )

  const active = await loadActiveSession(paths)
  assert.equal(active?.sessionId, 'legacy')
  assert.equal(active?.stage, 'awaiting_inquiry_execution')

  await rm(root, { recursive: true, force: true })
})

test('deep-dive-session-store isola sessoes paralelas por sessionId', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dd-session-isolation-'))
  const paths = buildLabPaths(root)
  const now = new Date().toISOString()

  await createSession(
    paths,
    {
      stage: 'awaiting_plan_decision',
      reportPath: 'reports/a.md',
      suggestedLeads: [],
      createdAt: now,
      updatedAt: now
    },
    's1'
  )
  await createSession(
    paths,
    {
      stage: 'awaiting_inquiry_execution',
      reportPath: 'reports/b.md',
      suggestedLeads: [],
      createdAt: now,
      updatedAt: now
    },
    's2'
  )

  await setActiveSession(paths, 's1')
  const first = await loadActiveSession(paths)
  await setActiveSession(paths, 's2')
  const second = await loadActiveSession(paths)

  assert.equal(first?.sessionId, 's1')
  assert.equal(first?.stage, 'awaiting_plan_decision')
  assert.equal(second?.sessionId, 's2')
  assert.equal(second?.stage, 'awaiting_inquiry_execution')

  await rm(root, { recursive: true, force: true })
})
