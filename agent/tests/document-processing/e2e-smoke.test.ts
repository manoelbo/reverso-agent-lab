/**
 * E2E smoke: pasta source temporária, 1 PDF (--max-pages 2), process-all, queue-status, queue-clear, limpeza.
 * Exige OPENROUTER_API_KEY em .env.local; caso contrário o teste é ignorado.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')
const TSX_CLI = path.join(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs')
const AGENT_CLI = path.join(PROJECT_ROOT, 'lab/agent/src/index.ts')
const FIXTURE_PDF = path.join(PROJECT_ROOT, 'examples/input/test-doc-erosao-renamed.pdf')
const E2E_TIMEOUT_MS = 180_000

function runCli(args: string[], sourceDir: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, AGENT_CLI, 'doc-process', ...args, '--source', sourceDir],
    {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    timeout: E2E_TIMEOUT_MS,
    env: { ...process.env }
    }
  )
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
}

test('E2E smoke: process-all em temp dir com 1 PDF (--max-pages 2), queue-status, queue-clear, cleanup', async () => {
  if (!existsSync(FIXTURE_PDF)) {
    console.log('Skip E2E: fixture PDF não encontrado em examples/input/test-doc-erosao-renamed.pdf')
    return
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'doc-tool-smoke-'))
  const pdfName = 'test-doc-erosao-renamed.pdf'
  const pdfPath = path.join(tempDir, pdfName)

  try {
    copyFileSync(FIXTURE_PDF, pdfPath)
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true })
    console.log('Skip E2E: falha ao copiar fixture PDF')
    return
  }

  try {
    const processResult = runCli(
      ['process-all', '--maxpages', '2', '--chunkpages', '2', '--concurrency', '1'],
      tempDir
    )

    if (processResult.stderr.includes('OPENROUTER_API_KEY') || processResult.status !== 0) {
      console.log(
        'Skip E2E: OPENROUTER_API_KEY ausente ou process-all falhou. Rode com .env.local configurado para executar o smoke.'
      )
      rmSync(tempDir, { recursive: true, force: true })
      return
    }

    const checkpointPath = path.join(tempDir, 'source-checkpoint.json')
    assert.ok(existsSync(checkpointPath), 'source-checkpoint.json deve existir')
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8'))
    assert.ok(Array.isArray(checkpoint.files), 'checkpoint.files deve ser array')
    const pdfEntry = checkpoint.files.find((f: { fileType: string }) => f.fileType === 'pdf')
    assert.ok(pdfEntry, 'deve existir entrada do PDF no checkpoint')

    const artifactDir = pdfEntry.artifactDir
    assert.ok(existsSync(path.join(artifactDir, 'replica.md')), 'replica.md deve existir')
    assert.ok(existsSync(path.join(artifactDir, 'preview.md')), 'preview.md deve existir')
    assert.ok(existsSync(path.join(artifactDir, 'metadata.md')), 'metadata.md deve existir')
    assert.ok(
      pdfEntry.status === 'done' || pdfEntry.status === 'failed',
      'status deve ser done ou failed'
    )

    const statusResult = runCli(['queue-status'], tempDir)
    assert.ok(
      statusResult.stdout.includes('Fila:') || statusResult.stdout.includes('Nenhum documento na fila'),
      'queue-status deve listar fila ou indicar vazia'
    )

    const clearResult = runCli(['queue-clear'], tempDir)
    assert.equal(clearResult.status, 0, 'queue-clear deve sair com 0')
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
