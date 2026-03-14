/**
 * Testes unitários da fila e checkpoint (sem API).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createEmptySourceCheckpoint,
  saveSourceCheckpoint,
  loadSourceCheckpoint,
  upsertSourceFileEntries,
  setSourceQueued,
  getSourceCheckpointPath
} from '../../src/tools/document-processing/source-checkpoint.js'
import type { SourceFileEntry } from '../../src/tools/document-processing/types.js'

test('loadSourceCheckpoint retorna null em diretório sem checkpoint', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'doc-tool-queue-'))
  try {
    const out = await loadSourceCheckpoint(dir)
    assert.equal(out, null)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('createEmptySourceCheckpoint + save + load preserva estrutura', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'doc-tool-queue-'))
  try {
    const empty = createEmptySourceCheckpoint(dir)
    assert.equal(empty.version, 1)
    assert.equal(empty.files.length, 0)
    assert.ok(empty.updatedAt)
    await saveSourceCheckpoint(dir, empty)
    const loaded = await loadSourceCheckpoint(dir)
    assert.ok(loaded)
    assert.equal(loaded!.version, 1)
    assert.equal(loaded!.files.length, 0)
    assert.equal(loaded!.sourceDir, dir.replace(/\/$/, ''))
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('upsertSourceFileEntries adiciona entrada e setSourceQueued seta queuedAt', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'doc-tool-queue-'))
  try {
    const entry: SourceFileEntry = {
      docId: 'test-doc-abc',
      originalFileName: 'test.pdf',
      sourcePath: path.join(dir, 'test.pdf'),
      fileType: 'pdf',
      artifactDir: path.join(dir, '.artifacts', 'test-doc-abc'),
      selected: false,
      status: 'not_processed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await upsertSourceFileEntries(dir, [entry])
    const afterUpsert = await loadSourceCheckpoint(dir)
    assert.ok(afterUpsert)
    assert.equal(afterUpsert!.files.length, 1)
    const firstAfterUpsert = afterUpsert!.files[0]
    assert.ok(firstAfterUpsert)
    assert.equal(firstAfterUpsert.docId, 'test-doc-abc')
    assert.equal(firstAfterUpsert.queuedAt, undefined)

    const now = new Date().toISOString()
    await setSourceQueued(dir, ['test-doc-abc'], now)
    const afterQueued = await loadSourceCheckpoint(dir)
    assert.ok(afterQueued)
    const firstAfterQueued = afterQueued!.files[0]
    assert.ok(firstAfterQueued)
    assert.equal(firstAfterQueued.queuedAt, now)

    await setSourceQueued(dir, ['test-doc-abc'], null)
    const afterClear = await loadSourceCheckpoint(dir)
    assert.ok(afterClear)
    const firstAfterClear = afterClear!.files[0]
    assert.ok(firstAfterClear)
    assert.equal(firstAfterClear.queuedAt, undefined)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('getSourceCheckpointPath retorna path do source-checkpoint.json', () => {
  const dir = '/tmp/source'
  const p = getSourceCheckpointPath(dir)
  assert.ok(p.endsWith('source-checkpoint.json'))
  assert.ok(p.includes('/tmp/source'))
})
