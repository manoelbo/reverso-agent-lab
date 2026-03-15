import { tool } from 'ai';
import { z } from 'zod';
import { resolveAgentPaths } from '../filesystem/paths';
import { detectSystemState } from '../filesystem/state-detector';

export const checkSystemStateTool = tool({
  description:
    'Check the current state of the investigation system: source files, processing status, agent context, leads, deep-dive sessions.',
  inputSchema: z.object({}),
  execute: async () => {
    const paths = resolveAgentPaths();
    const state = await detectSystemState(paths);
    return {
      sourceEmpty: state.sourceEmpty,
      totalSourceFiles: state.totalSourceFiles,
      processedCount: state.processedFiles.length,
      unprocessedCount: state.unprocessedFiles.length,
      unprocessedFiles: state.unprocessedFiles.map((f) => f.fileName),
      failedCount: state.failedFiles.length,
      hasAgentContext: state.hasAgentContext,
      isFirstVisit: state.isFirstVisit,
      hasDeepDiveSession: state.hasDeepDiveSession,
      sessionStage: state.sessionStage,
      leadsCount: state.leads.length,
      leads: state.leads.map((l) => ({
        slug: l.slug,
        title: l.title,
        status: l.status,
      })),
      hasPreviewsWithoutInit: state.hasPreviewsWithoutInit,
    };
  },
});
