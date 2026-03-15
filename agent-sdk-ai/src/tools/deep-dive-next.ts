import { tool } from 'ai'
import { z } from 'zod'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput } from './helpers'

export const deepDiveNextTool = tool({
  description:
    'Continua uma sessão ativa de deep-dive (ex.: planejar todos os leads, executar inquiry, refazer busca).',
  inputSchema: z.object({
    text: z.string().min(2).max(400),
  }),
  execute: async ({ text }) => {
    const result = await runLegacyCommand(['deep-dive-next', '--text', text])
    return {
      ok: true,
      stdout: compactOutput(result.stdout, 2200),
      elapsedMs: result.elapsedMs,
    }
  },
})
