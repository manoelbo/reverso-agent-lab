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
})
