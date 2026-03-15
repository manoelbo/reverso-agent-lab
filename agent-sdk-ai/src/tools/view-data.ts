import path from 'node:path'
import { tool } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '@/lib/config'
import { listMarkdownFiles, readUtf8 } from '@/lib/filesystem'
import { detectSystemState } from '@/lib/source-state'
import { parseLeadSummaryFromMarkdown } from '@/lib/format-parsers'

async function summarizeLead(filePath: string): Promise<{
  slug: string
  title: string
  status: string
}> {
  const raw = (await readUtf8(filePath)) ?? ''
  return parseLeadSummaryFromMarkdown({
    fileName: path.basename(filePath),
    raw,
  })
}

export const viewDataTool = tool({
  description:
    'Consulta e lista dados existentes (leads, dossiê, alegações, findings e status das fontes).',
  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .max(240)
      .describe('Pedido de visualização do usuário.'),
  }),
  execute: async ({ query }) => {
    const { paths } = resolveConfig()
    const sourceState = await detectSystemState(paths)

    const leadFiles = await listMarkdownFiles(paths.leadsDir)
    const leads = await Promise.all(
      leadFiles.slice(0, 30).map((fileName) => summarizeLead(path.join(paths.leadsDir, fileName)))
    )

    const allegations = await listMarkdownFiles(paths.allegationsDir)
    const findings = await listMarkdownFiles(paths.findingsDir)
    const people = await listMarkdownFiles(path.join(paths.dossierDir, 'people'))
    const groups = await listMarkdownFiles(path.join(paths.dossierDir, 'groups'))
    const places = await listMarkdownFiles(path.join(paths.dossierDir, 'places'))

    return {
      ok: true,
      query,
      source: {
        processed: sourceState.processedFiles.length,
        pending: sourceState.unprocessedFiles.length,
        failed: sourceState.failedFiles.length,
      },
      leads,
      allegationsCount: allegations.length,
      findingsCount: findings.length,
      dossier: {
        peopleCount: people.length,
        groupsCount: groups.length,
        placesCount: places.length,
      },
    }
  },
})
