import { tool } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveAgentPaths } from '../filesystem/paths';
import { loadPreviewsIncremental, limitText, fileExists } from '../filesystem/io';

const PREVIEW_MAX_CHARS = 3000;
const PREVIEW_MAX_COUNT = 8;

export const quickResearchTool = tool({
  description:
    'Search processed documents to answer a specific factual question. Returns relevant excerpts from source previews along with source references. Use for direct questions like "who is X?", "what does document Y say about Z?".',
  inputSchema: z.object({
    question: z
      .string()
      .describe('The specific question to research in the processed documents'),
  }),
  execute: async ({ question }) => {
    const paths = resolveAgentPaths();

    // Load previews
    const { previews } = await loadPreviewsIncremental(paths.sourceArtifactsDir, paths.sourceDir);

    if (previews.length === 0) {
      return {
        ok: false,
        error: 'No processed documents available. Process documents first.',
      };
    }

    // Load agent.md for additional context
    let agentContext: string | undefined;
    const agentPath = path.join(paths.outputDir, 'agent.md');
    if (await fileExists(agentPath)) {
      try {
        agentContext = await readFile(agentPath, 'utf8');
      } catch {
        // ok
      }
    }

    // Return previews as context for the LLM to search through
    const sources = previews.slice(0, PREVIEW_MAX_COUNT).map((p) => ({
      docId: p.docId,
      documentName: p.documentName,
      content: limitText(p.content, PREVIEW_MAX_CHARS),
    }));

    return {
      ok: true,
      question,
      sourcesConsulted: sources.length,
      totalSources: previews.length,
      sources,
      agentContext: agentContext ? limitText(agentContext, 2000) : undefined,
    };
  },
});
