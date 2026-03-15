import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '@/lib/config'
import { readUtf8 } from '@/lib/filesystem'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput, parseToolContext, requiresApproval } from './helpers'

export const initContextTool = tool({
  description:
    'Executa init para gerar/atualizar o arquivo agent.md com contexto investigativo inicial.',
  inputSchema: z.object({
    force: z
      .boolean()
      .default(false)
      .describe('Quando true, força reinit mesmo que agent.md já exista.'),
  }),
  needsApproval: async (input, options) => {
    const config = resolveConfig()
    const hasAgentMd = Boolean(await readUtf8(path.join(config.paths.outputDir, 'agent.md')))
    if (!hasAgentMd) return false
    if (input.force) return requiresApproval(options.experimental_context)
    const parsed = parseToolContext(options.experimental_context)
    return parsed.autoAccept !== true
  },
  execute: async () => {
    const config = resolveConfig()
    const result = await runLegacyCommand(['init'])
    const agentMd = await readUtf8(path.join(config.paths.outputDir, 'agent.md'))

    return {
      ok: true,
      agentMdCreated: Boolean(agentMd),
      agentMdPreview: agentMd ? compactOutput(agentMd, 2400) : '',
      stdout: compactOutput(result.stdout),
      elapsedMs: result.elapsedMs,
    }
  },
})
