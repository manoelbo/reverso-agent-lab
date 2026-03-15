import { spawn } from 'node:child_process'
import { resolveConfig } from './config'

export interface LegacyCommandResult {
  command: string
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  elapsedMs: number
}

export async function runLegacyCommand(
  args: string[],
  timeoutMs = 10 * 60 * 1000
): Promise<LegacyCommandResult> {
  const { paths } = resolveConfig()
  const started = Date.now()

  return await new Promise<LegacyCommandResult>((resolve, reject) => {
    const child = spawn('pnpm', args, {
      cwd: paths.legacyRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Comando legado expirou após ${timeoutMs}ms: pnpm ${args.join(' ')}`))
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', (exitCode) => {
      clearTimeout(timeout)
      const result: LegacyCommandResult = {
        command: 'pnpm',
        args,
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
      }

      if (result.exitCode !== 0) {
        reject(
          new Error(
            `Falha em comando legado (exit ${result.exitCode}): pnpm ${args.join(
              ' '
            )}\n${result.stderr || result.stdout}`
          )
        )
        return
      }

      resolve(result)
    })
  })
}
