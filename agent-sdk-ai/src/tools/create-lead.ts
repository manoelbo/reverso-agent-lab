import { tool } from 'ai'
import { z } from 'zod'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput } from './helpers'
import { resolveConfig } from '@/lib/config'
import { listMarkdownFiles, readUtf8 } from '@/lib/filesystem'
import { dedupeLeadCandidates } from '@/lib/lead-dedupe'
import path from 'node:path'

async function listExistingLeads(): Promise<Array<{ slug: string; title: string }>> {
  const { paths } = resolveConfig()
  const files = await listMarkdownFiles(paths.leadsDir)
  const leads: Array<{ slug: string; title: string }> = []

  for (const fileName of files.slice(0, 50)) {
    const raw = await readUtf8(path.join(paths.leadsDir, fileName))
    const title =
      raw?.match(/^title:\s+"?(.+?)"?$/m)?.[1] ??
      raw?.match(/^#\s+(.+)$/m)?.[1] ??
      fileName.replace(/^lead-/, '').replace(/\.md$/i, '')
    leads.push({
      slug: fileName.replace(/^lead-/, '').replace(/\.md$/i, ''),
      title: title.trim(),
    })
  }

  return leads
}

export const createLeadTool = tool({
  description:
    'Cria um lead investigativo a partir de hipótese do usuário e gera inquiry plan estruturado.',
  inputSchema: z.object({
    idea: z.string().min(8).max(600),
  }),
  execute: async ({ idea }) => {
    const existingLeads = await listExistingLeads()
    const [decision] = dedupeLeadCandidates([{ title: idea }], existingLeads)
    if (decision?.duplicated && decision.matchedWith) {
      return {
        ok: false,
        duplicated: true,
        matchedWith: decision.matchedWith,
        message:
          'A hipótese parece duplicar um lead existente. Posso rodar inquiry no lead já existente em vez de criar um novo.',
      }
    }

    const result = await runLegacyCommand(['create-lead', '--idea', idea])
    return {
      ok: true,
      stdout: compactOutput(result.stdout, 2400),
      elapsedMs: result.elapsedMs,
    }
  },
})
