import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import {
  clearInvestigationCheckpoint,
  getInvestigationCheckpointPath,
  loadInvestigationCheckpoint,
  restoreInvestigationCheckpoint,
  saveInvestigationCheckpoint
} from '../src/core/investigation-checkpoint.js'

test('investigation-checkpoint: save/load/restore/clear', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inq-checkpoint-'))
  const investigationDir = path.join(root, 'investigation')
  await saveInvestigationCheckpoint(investigationDir, {
    leadSlug: 'abc',
    stage: 'planning',
    reviewQueueIds: ['f-1']
  })
  const loaded = await loadInvestigationCheckpoint(investigationDir, 'abc')
  const restored = await restoreInvestigationCheckpoint(investigationDir, 'abc')
  assert.equal(loaded?.leadSlug, 'abc')
  assert.equal(restored?.stage, 'planning')
  await clearInvestigationCheckpoint(investigationDir, 'abc')
  const afterClear = await loadInvestigationCheckpoint(investigationDir, 'abc')
  assert.equal(afterClear, undefined)
  await rm(root, { recursive: true, force: true })
})

test('investigation-checkpoint: tolera formato legado sem version', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inq-checkpoint-legacy-'))
  const investigationDir = path.join(root, 'investigation')
  const filePath = getInvestigationCheckpointPath(investigationDir, 'legacy')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(
    filePath,
    JSON.stringify({
      savedAt: new Date().toISOString(),
      state: {
        leadSlug: 'legacy',
        stage: 'post_tools'
      }
    }),
    'utf8'
  )
  const loaded = await loadInvestigationCheckpoint(investigationDir, 'legacy')
  assert.equal(loaded?.leadSlug, 'legacy')
  assert.equal(loaded?.stage, 'post_tools')
  await rm(root, { recursive: true, force: true })
})

test('investigation-checkpoint: retorna undefined para arquivo corrompido', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inq-checkpoint-bad-'))
  const investigationDir = path.join(root, 'investigation')
  const filePath = getInvestigationCheckpointPath(investigationDir, 'bad')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, '{ invalid-json', 'utf8')
  const loaded = await loadInvestigationCheckpoint(investigationDir, 'bad')
  assert.equal(loaded, undefined)
  await rm(root, { recursive: true, force: true })
})
