import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '@/lib/config'
import { readUtf8 } from '@/lib/filesystem'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput, requiresApproval } from './helpers'

export const updateAgentContextTool = tool({
  description:
    'Atualiza instruções/contexto em agent.md (memória da investigação) a partir da fala do usuário.',
  inputSchema: z.object({
    instructions: z.string().min(6).max(1200),
  }),
  needsApproval: async (_input, options) => {
    return requiresApproval(options.experimental_context)
  },
  execute: async ({ instructions }) => {
    const config = resolveConfig()
    const result = await runLegacyCommand(['agent-setup', '--text', instructions])
    const agentMd = await readUtf8(path.join(config.paths.outputDir, 'agent.md'))

    return {
      ok: true,
      stdout: compactOutput(result.stdout, 1800),
      updatedAgentMdPreview: agentMd ? compactOutput(agentMd, 2400) : '',
      elapsedMs: result.elapsedMs,
    }
  },
})
