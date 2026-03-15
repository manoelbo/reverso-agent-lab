import { tool } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '@/lib/config'
import { detectSystemState } from '@/lib/source-state'
import { loadActiveDeepDiveSession } from '@/lib/session-store'

export const getSystemStateTool = tool({
  description:
    'Retorna estado atual do projeto (source, processamento, contexto, sessão deep-dive e contagens).',
  inputSchema: z.object({}),
  execute: async () => {
    const { paths } = resolveConfig()
    const state = await detectSystemState(paths)
    const session = await loadActiveDeepDiveSession(paths)

    return {
      ok: true,
      sourceEmpty: state.sourceEmpty,
      processedCount: state.processedFiles.length,
      pendingCount: state.unprocessedFiles.length,
      failedCount: state.failedFiles.length,
      hasAgentContext: state.hasAgentContext,
      hasPreviewsWithoutInit: state.hasPreviewsWithoutInit,
      leadsCount: state.leadsCount,
      isFirstVisit: state.isFirstVisit,
      deepDiveSession:
        session && session.stage
          ? {
              stage: session.stage,
              updatedAt: session.updatedAt,
              suggestedLeads: session.suggestedLeads?.slice(0, 3) ?? [],
            }
          : null,
    }
  },
})
