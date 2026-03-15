import { tool, generateText, Output } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { getModel } from '../config';
import { resolveAgentPaths } from '../filesystem/paths';
import { loadPreviewsIncremental, writeUtf8, slugify, fileExists, listLeadSummaries } from '../filesystem/io';
import { createLeadFile } from './investigative/create-lead-file';
import {
  buildDigSystemPrompt,
  buildDigIncrementalPrompt,
  buildDigLinesPrompt,
  buildDigRankAndComparePrompt,
  type DigIncrementalConclusion,
  type DigLinesResult,
  type DigComparisonResult,
} from '../prompts/dig';
import { detectLanguageFromText, type LanguageCode } from '../core/language';
import { stripCodeFence } from '../core/markdown';

// Zod schemas for structured output
const incrementalConclusionSchema = z.object({
  summary: z.string(),
  keyFindings: z.array(z.string()),
  hypotheses: z.array(z.string()),
  gaps: z.array(z.string()),
});

const linesResultSchema = z.object({
  lines: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      rank: z.number(),
      rationale: z.string(),
    }),
  ),
});

const comparisonResultSchema = z.object({
  topLines: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      differentiation: z.string(),
      rank: z.number(),
    }),
  ),
  recommendation: z.string(),
  overlapNotes: z.array(z.string()),
});

export const deepDiveTool = tool({
  description:
    'Perform a deep-dive analysis of source documents. Incrementally analyzes previews one by one, generates investigative lines, ranks the top 3, and creates draft leads. Returns a report with suggested leads.',
  inputSchema: z.object({}),
  execute: async () => {
    const paths = resolveAgentPaths();

    // 1. Load previews
    const { previews } = await loadPreviewsIncremental(paths.sourceArtifactsDir, paths.sourceDir);

    if (previews.length === 0) {
      return {
        ok: false,
        error: 'No previews found. Process documents first.',
      };
    }

    const language: LanguageCode = 'pt';
    const model = getModel();

    // 2. Incremental analysis
    let accumulatedConclusions: DigIncrementalConclusion | undefined;

    for (let i = 0; i < previews.length; i++) {
      const p = previews[i]!;
      const userPrompt = buildDigIncrementalPrompt(accumulatedConclusions, p.content, p.documentName);

      try {
        const { output } = await generateText({
          model,
          system: buildDigSystemPrompt(language),
          prompt: userPrompt,
          temperature: 0.2,
          output: Output.object({ schema: incrementalConclusionSchema }),
        });

        if (output) {
          accumulatedConclusions = output;
        }
      } catch {
        // If structured output fails, try raw text parsing
        const { text } = await generateText({
          model,
          system: buildDigSystemPrompt(language),
          prompt: userPrompt,
          temperature: 0.2,
        });
        try {
          accumulatedConclusions = JSON.parse(stripCodeFence(text));
        } catch {
          // Keep previous conclusions
        }
      }
    }

    if (!accumulatedConclusions) {
      return {
        ok: false,
        error: 'Failed to generate incremental conclusions from previews.',
      };
    }

    // 3. Generate investigative lines
    let suggestedLines: DigLinesResult | undefined;
    try {
      const { output } = await generateText({
        model,
        system: buildDigSystemPrompt(language),
        prompt: buildDigLinesPrompt(accumulatedConclusions),
        temperature: 0.2,
        output: Output.object({ schema: linesResultSchema }),
      });
      suggestedLines = output ?? undefined;
    } catch {
      const { text } = await generateText({
        model,
        system: buildDigSystemPrompt(language),
        prompt: buildDigLinesPrompt(accumulatedConclusions),
        temperature: 0.2,
      });
      try {
        suggestedLines = JSON.parse(stripCodeFence(text));
      } catch {
        suggestedLines = { lines: [] };
      }
    }

    if (!suggestedLines || suggestedLines.lines.length === 0) {
      return {
        ok: false,
        error: 'Failed to generate investigative lines.',
        conclusions: accumulatedConclusions,
      };
    }

    // 4. Load existing leads for comparison
    const existingLeads = await listLeadSummaries(paths.leadsDir);
    const existingMarkdown = existingLeads.length > 0
      ? existingLeads.map((l) => `### ${l.slug}\n${l.title}: ${l.description}`).join('\n\n')
      : '';

    // 5. Rank and compare
    let comparisonResult: DigComparisonResult | undefined;
    try {
      const { output } = await generateText({
        model,
        system: buildDigSystemPrompt(language),
        prompt: buildDigRankAndComparePrompt(suggestedLines, existingMarkdown),
        temperature: 0.2,
        output: Output.object({ schema: comparisonResultSchema }),
      });
      comparisonResult = output ?? undefined;
    } catch {
      const { text } = await generateText({
        model,
        system: buildDigSystemPrompt(language),
        prompt: buildDigRankAndComparePrompt(suggestedLines, existingMarkdown),
        temperature: 0.2,
      });
      try {
        comparisonResult = JSON.parse(stripCodeFence(text));
      } catch {
        comparisonResult = {
          topLines: suggestedLines.lines.slice(0, 3).map((l, i) => ({
            title: l.title,
            description: l.description,
            differentiation: l.rationale,
            rank: i + 1,
          })),
          recommendation: 'Review the suggested leads.',
          overlapNotes: [],
        };
      }
    }

    if (!comparisonResult) {
      return {
        ok: false,
        error: 'Failed to rank and compare investigative lines.',
        conclusions: accumulatedConclusions,
      };
    }

    // 6. Create draft leads
    const createdLeads: Array<{
      slug: string;
      title: string;
      description: string;
      status: 'draft';
      isNew: boolean;
    }> = [];

    for (const line of comparisonResult.topLines.slice(0, 3)) {
      const slug = slugify(line.title);
      if (!slug) continue;

      // Check if lead already exists
      const leadPath = path.join(paths.leadsDir, `lead-${slug}.md`);
      if (await fileExists(leadPath)) {
        createdLeads.push({
          slug,
          title: line.title,
          description: line.description,
          status: 'draft',
          isNew: false,
        });
        continue;
      }

      await createLeadFile(
        {
          slug,
          title: line.title,
          description: line.description,
          status: 'draft',
        },
        paths,
      );

      createdLeads.push({
        slug,
        title: line.title,
        description: line.description,
        status: 'draft',
        isNew: true,
      });
    }

    // 7. Save report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(paths.reportsDir, `deep-dive-${timestamp}.md`);
    const reportContent = [
      '# Deep Dive Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Previews analyzed: ${previews.length}`,
      '',
      '## Conclusions',
      accumulatedConclusions.summary,
      '',
      '### Key Findings',
      ...accumulatedConclusions.keyFindings.map((f) => `- ${f}`),
      '',
      '### Hypotheses',
      ...accumulatedConclusions.hypotheses.map((h) => `- ${h}`),
      '',
      '### Gaps',
      ...accumulatedConclusions.gaps.map((g) => `- ${g}`),
      '',
      '## Suggested Leads',
      ...comparisonResult.topLines.map(
        (l) => `${l.rank}. **${l.title}** — ${l.description}\n   Differentiation: ${l.differentiation}`,
      ),
      '',
      '## Recommendation',
      comparisonResult.recommendation,
      '',
    ].join('\n');

    await writeUtf8(reportPath, reportContent);

    return {
      ok: true,
      previewsAnalyzed: previews.length,
      conclusions: accumulatedConclusions,
      suggestedLeads: createdLeads,
      recommendation: comparisonResult.recommendation,
      overlapNotes: comparisonResult.overlapNotes,
      reportPath: `reports/deep-dive-${timestamp}.md`,
    };
  },
});
