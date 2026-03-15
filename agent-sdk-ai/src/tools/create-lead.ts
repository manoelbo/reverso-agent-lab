import { tool } from 'ai'
import { z } from 'zod'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput } from './helpers'

export const createLeadTool = tool({
  description:
    'Cria um lead investigativo a partir de hipótese do usuário e gera inquiry plan estruturado.',
  inputSchema: z.object({
    idea: z.string().min(8).max(600),
  }),
  execute: async ({ idea }) => {
    const result = await runLegacyCommand(['create-lead', '--idea', idea])
    return {
      ok: true,
      stdout: compactOutput(result.stdout, 2400),
      elapsedMs: result.elapsedMs,
    }
  },
})
