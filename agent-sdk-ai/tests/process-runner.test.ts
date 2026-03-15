import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { runProcess } from '../src/lib/process-runner'

describe('runProcess', () => {
  it('captura stdout e código de saída', async () => {
    const result = await runProcess({
      command: 'node',
      args: ['-e', 'console.log("runner-ok")'],
      cwd: process.cwd(),
      timeoutMs: 3000,
    })

    assert.equal(result.exitCode, 0)
    assert.ok(result.stdout.includes('runner-ok'))
  })

  it('retorna exitCode de falha sem lançar quando processo encerra com erro', async () => {
    const result = await runProcess({
      command: 'node',
      args: ['-e', 'process.stderr.write("runner-fail\\n"); process.exit(3)'],
      cwd: process.cwd(),
      timeoutMs: 3000,
    })

    assert.equal(result.exitCode, 3)
    assert.ok(result.stderr.includes('runner-fail'))
  })
})
