import { tool, generateText } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { getModel } from '../config';
import { resolveAgentPaths } from '../filesystem/paths';
import { loadRandomPreviewsWithinBudget, writeUtf8, fileExists } from '../filesystem/io';
import { formatFrontmatter } from '../core/markdown';
import { buildInitSystemPrompt } from '../prompts/init';
import { detectLanguageFromText, type LanguageCode } from '../core/language';

export const initContextTool = tool({
  description:
    'Initialize or update the investigation context (agent.md) by analyzing processed document previews. Creates a comprehensive understanding of the source material.',
  inputSchema: z.object({
    maxTokens: z
      .number()
      .optional()
      .default(20000)
      .describe('Maximum token budget for loading previews'),
  }),
  execute: async ({ maxTokens }) => {
    const paths = resolveAgentPaths();
    const agentPath = path.join(paths.outputDir, 'agent.md');
    const isReInit = await fileExists(agentPath);

    // 1. Load previews
    const result = await loadRandomPreviewsWithinBudget(
      paths.sourceArtifactsDir,
      paths.sourceDir,
      maxTokens,
    );

    if (result.previews.length === 0) {
      return {
        ok: false,
        error: 'No previews found. Make sure documents have been processed first.',
        candidatesCount: result.candidatesCount,
      };
    }

    // 2. Build user prompt from previews
    const userPrompt = result.previews
      .map((p) => `## Document: ${p.documentName}\n\n${p.content}`)
      .join('\n\n---\n\n');

    // 3. Generate understanding via LLM
    const language: LanguageCode = 'pt'; // Default to Portuguese for this agent
    const { text: understanding } = await generateText({
      model: getModel(),
      system: buildInitSystemPrompt(language),
      prompt: userPrompt,
      temperature: 0.2,
    });

    // 4. Build and write agent.md
    const previewList = result.previews
      .map((p) => `- ${p.documentName} (${p.docId})`)
      .join('\n');

    const agentContent = [
      formatFrontmatter({
        type: 'agent_config',
        updated: new Date().toISOString(),
        previews_used: result.usedCount,
        estimated_tokens: result.estimatedTokens,
      }),
      '',
      understanding.trim(),
      '',
      '## Previews used',
      '',
      previewList,
      '',
    ].join('\n');

    await writeUtf8(agentPath, agentContent);

    return {
      ok: true,
      isReInit,
      previewsUsed: result.usedCount,
      estimatedTokens: result.estimatedTokens,
      agentMdContent: agentContent,
      agentMdPath: 'agent.md',
    };
  },
});
