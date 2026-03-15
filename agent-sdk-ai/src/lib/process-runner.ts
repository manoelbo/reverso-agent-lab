import { spawn } from 'node:child_process'

export interface ProcessRunnerInput {
  command: string
  args: string[]
  cwd: string
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

export interface ProcessRunnerResult {
  command: string
  args: string[]
  exitCode: number
  stdout: string
  stderr: string
  elapsedMs: number
}

export async function runProcess(input: ProcessRunnerInput): Promise<ProcessRunnerResult> {
  const started = Date.now()
  const timeoutMs = input.timeoutMs ?? 10 * 60 * 1000

  return await new Promise<ProcessRunnerResult>((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(
        new Error(
          `Processo expirou após ${timeoutMs}ms: ${input.command} ${input.args.join(' ')}`
        )
      )
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
      resolve({
        command: input.command,
        args: input.args,
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        elapsedMs: Date.now() - started,
      })
    })
  })
}
