import { tool } from 'ai'
import { z } from 'zod'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput } from './helpers'

export const runInquiryTool = tool({
  description:
    'Executa inquiry PEV para um lead específico e persiste allegations/findings/conclusão.',
  inputSchema: z.object({
    lead: z
      .string()
      .min(2)
      .max(180)
      .describe('Slug do lead, com ou sem prefixo lead-.'),
  }),
  execute: async ({ lead }) => {
    const normalized = lead.replace(/^lead-/, '').replace(/\.md$/i, '')
    const result = await runLegacyCommand(['inquiry', '--lead', normalized])
    return {
      ok: true,
      lead: normalized,
      stdout: compactOutput(result.stdout, 2600),
      elapsedMs: result.elapsedMs,
    }
  },
})
