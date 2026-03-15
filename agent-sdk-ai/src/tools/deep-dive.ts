import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { listMarkdownFiles, readUtf8 } from '@/lib/filesystem'
import { resolveConfig } from '@/lib/config'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput } from './helpers'

async function listLeadTitles(leadsDir: string): Promise<string[]> {
  const files = await listMarkdownFiles(leadsDir)
  const titles: string[] = []
  for (const fileName of files.slice(0, 20)) {
    const raw = await readUtf8(path.join(leadsDir, fileName))
    if (!raw) continue
    const title =
      raw.match(/^title:\s+"?(.+?)"?$/m)?.[1] ??
      raw.match(/^#\s+(.+)$/m)?.[1] ??
      fileName.replace(/\.md$/, '')
    if (title) titles.push(title.trim())
  }
  return titles
}

export const deepDiveTool = tool({
  description:
    'Executa deep-dive investigativo (análise incremental de previews, geração de linhas e sugestões de leads).',
  inputSchema: z.object({
    focus: z
      .string()
      .max(240)
      .optional()
      .describe('Foco opcional para a rodada de deep-dive.'),
  }),
  execute: async (input) => {
    const args = ['deep-dive']
    if (input.focus) {
      args.push('--text', input.focus)
    }
    const result = await runLegacyCommand(args)
    const config = resolveConfig()
    const leadTitles = await listLeadTitles(config.paths.leadsDir)

    return {
      ok: true,
      leadsCount: leadTitles.length,
      topLeads: leadTitles.slice(0, 3),
      stdout: compactOutput(result.stdout, 2400),
      elapsedMs: result.elapsedMs,
    }
  },
})
