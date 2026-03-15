import { resolveConfig } from './config'
import { runProcess } from './process-runner'

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
  const result = await runProcess({
    command: 'pnpm',
    args,
    cwd: paths.legacyRoot,
    timeoutMs,
    env: process.env,
  })

  if (result.exitCode !== 0) {
    throw new Error(
      `Falha em comando legado (exit ${result.exitCode}): pnpm ${args.join(' ')}\n${
        result.stderr || result.stdout
      }`
    )
  }

  return result
}
