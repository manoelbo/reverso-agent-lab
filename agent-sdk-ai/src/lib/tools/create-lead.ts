import { tool, generateText, Output } from 'ai';
import { z } from 'zod';
import { getModel } from '../config';
import { resolveAgentPaths } from '../filesystem/paths';
import { fileExists, listLeadSummaries, slugify, loadPreviewsIncremental, limitText } from '../filesystem/io';
import { createLeadFile } from './investigative/create-lead-file';
import { buildCreateLeadSystemPrompt, buildCreateLeadUserPrompt } from '../prompts/create-lead';
import { stripCodeFence } from '../core/markdown';
import type { InquiryPlan } from '../core/contracts';
import path from 'node:path';

const createLeadSchema = z.object({
  codename: z.string(),
  title: z.string(),
  description: z.string(),
  inquiryPlan: z.object({
    formulateAllegations: z.array(z.string()),
    defineSearchStrategy: z.array(z.string()),
    gatherFindings: z.array(z.string()),
    mapToAllegations: z.array(z.string()),
  }),
});

export const createLeadTool = tool({
  description:
    'Create an investigation lead with an inquiry plan. Can be based on a user hypothesis/idea or generated freely from available source material.',
  inputSchema: z.object({
    idea: z
      .string()
      .optional()
      .describe('The investigation hypothesis or idea from the user. If empty, generates freely.'),
  }),
  execute: async ({ idea }) => {
    const paths = resolveAgentPaths();

    // Build source summary from previews
    const { previews } = await loadPreviewsIncremental(paths.sourceArtifactsDir, paths.sourceDir);
    const sourceSummary =
      previews.length > 0
        ? previews
            .slice(0, 5)
            .map((p, i) => `${i + 1}. ${p.documentName} (${p.docId})`)
            .join('\n')
        : undefined;

    // Generate lead via LLM
    const model = getModel();
    let parsed: z.infer<typeof createLeadSchema> | undefined;

    try {
      const { output } = await generateText({
        model,
        system: buildCreateLeadSystemPrompt('pt'),
        prompt: buildCreateLeadUserPrompt(idea, sourceSummary),
        temperature: 0.3,
        output: Output.object({ schema: createLeadSchema }),
      });
      parsed = output ?? undefined;
    } catch {
      // Fallback: raw text parsing
      const { text } = await generateText({
        model,
        system: buildCreateLeadSystemPrompt('pt'),
        prompt: buildCreateLeadUserPrompt(idea, sourceSummary),
        temperature: 0.3,
      });
      try {
        parsed = createLeadSchema.parse(JSON.parse(stripCodeFence(text)));
      } catch {
        return { ok: false, error: 'Failed to generate a valid lead structure.' };
      }
    }

    if (!parsed) {
      return { ok: false, error: 'Failed to generate lead.' };
    }

    const slug = slugify(parsed.codename);
    if (!slug) {
      return { ok: false, error: 'Generated codename could not be converted to a valid slug.' };
    }

    // Check for existing leads with same slug
    const leadPath = path.join(paths.leadsDir, `lead-${slug}.md`);
    if (await fileExists(leadPath)) {
      return {
        ok: false,
        error: `A lead with slug "${slug}" already exists. Please modify the hypothesis or use a different name.`,
        existingSlug: slug,
      };
    }

    // Create the lead file
    const { leadPath: createdPath } = await createLeadFile(
      {
        slug,
        title: parsed.title,
        description: parsed.description,
        status: 'planned',
        inquiryPlan: parsed.inquiryPlan,
      },
      paths,
    );

    return {
      ok: true,
      slug,
      title: parsed.title,
      description: parsed.description,
      inquiryPlan: parsed.inquiryPlan,
      leadPath: `investigation/leads/lead-${slug}.md`,
    };
  },
});
