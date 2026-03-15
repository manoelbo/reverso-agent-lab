import { tool, generateText, Output } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { getModel } from '../config';
import { resolveAgentPaths } from '../filesystem/paths';
import { loadPreviewsIncremental, limitText, slugify } from '../filesystem/io';
import { buildInquirySystemPrompt, buildInquiryUserPrompt } from '../prompts/inquiry';
import { appendLeadConclusion, persistInquiryArtifacts } from './investigative/create-lead-file';
import { stripCodeFence } from '../core/markdown';
import type { InquiryScenario, LeadAllegation, LeadFinding, FindingEvidence } from '../core/contracts';

const inquiryOutputSchema = z.object({
  scenario: z.enum(['positive', 'negative', 'plan_another_inquiry']),
  confidence: z.number().min(0).max(1),
  conclusion: z.string(),
  allegations: z.array(
    z.object({
      id: z.string(),
      statement: z.string(),
    }),
  ),
  findings: z.array(
    z.object({
      id: z.string(),
      claim: z.string(),
      status: z.enum(['verified', 'unverified', 'rejected']),
      supportsAllegationIds: z.array(z.string()),
      evidence: z.array(
        z.object({
          source_id: z.string(),
          excerpt: z.string(),
          confidence: z.number().min(0).max(1),
          verification_status: z.enum(['verified', 'weak', 'missing']),
        }),
      ),
    }),
  ),
});

type InquiryOutput = z.infer<typeof inquiryOutputSchema>;

export const runInquiryTool = tool({
  description:
    'Execute a full inquiry investigation for a specific lead. Follows the investigation plan to search for evidence, formulate allegations, and gather findings. Persists results to the filesystem.',
  inputSchema: z.object({
    leadSlug: z.string().describe('The slug of the lead to investigate (without "lead-" prefix)'),
  }),
  execute: async ({ leadSlug }) => {
    const paths = resolveAgentPaths();

    // Normalize slug
    const slug = leadSlug.replace(/^lead-/, '').replace(/\.md$/, '');

    // 1. Read lead file
    const leadPath = path.join(paths.leadsDir, `lead-${slug}.md`);
    let leadMarkdown: string;
    try {
      leadMarkdown = await readFile(leadPath, 'utf8');
    } catch {
      return {
        ok: false,
        error: `Lead not found: lead-${slug}.md. Create the lead first.`,
      };
    }

    // 2. Load source previews
    const { previews } = await loadPreviewsIncremental(paths.sourceArtifactsDir, paths.sourceDir);
    const sourceSummary =
      previews.length > 0
        ? previews
            .slice(0, 10)
            .map((p, i) => {
              const excerpt = limitText(p.content.replace(/\s+/g, ' ').trim(), 1200);
              return `## Source ${i + 1}: ${p.documentName} (${p.docId})\n${excerpt}`;
            })
            .join('\n\n')
        : '(No previews available)';

    // 3. Execute inquiry via LLM
    const model = getModel();
    let inquiryResult: InquiryOutput | undefined;

    try {
      const { output } = await generateText({
        model,
        system: buildInquirySystemPrompt('pt'),
        prompt: buildInquiryUserPrompt({
          leadSlug: slug,
          leadMarkdown: limitText(leadMarkdown, 10000),
          sourceSummary,
        }),
        temperature: 0.2,
        output: Output.object({ schema: inquiryOutputSchema }),
      });
      inquiryResult = output ?? undefined;
    } catch {
      // Fallback: raw text parsing
      const { text } = await generateText({
        model,
        system: buildInquirySystemPrompt('pt'),
        prompt: buildInquiryUserPrompt({
          leadSlug: slug,
          leadMarkdown: limitText(leadMarkdown, 10000),
          sourceSummary,
        }),
        temperature: 0.2,
      });
      try {
        inquiryResult = inquiryOutputSchema.parse(JSON.parse(stripCodeFence(text)));
      } catch {
        return {
          ok: false,
          error: 'Failed to generate valid inquiry results.',
          rawText: text.slice(0, 500),
        };
      }
    }

    if (!inquiryResult) {
      return { ok: false, error: 'Failed to generate inquiry results.' };
    }

    // 4. Persist artifacts
    const allegations: LeadAllegation[] = inquiryResult.allegations.map((a) => ({
      id: a.id,
      statement: a.statement,
    }));

    const findings: LeadFinding[] = inquiryResult.findings.map((f) => ({
      id: f.id,
      claim: f.claim,
      status: f.status,
      supportsAllegationIds: f.supportsAllegationIds,
      evidence: f.evidence.map((e) => ({
        source_id: e.source_id,
        source: e.source_id,
        excerpt: e.excerpt,
        confidence: e.confidence,
        verification_status: e.verification_status,
      })),
    }));

    const persisted = await persistInquiryArtifacts(
      { slug, allegations, findings },
      paths,
    );

    // 5. Append conclusion to lead
    await appendLeadConclusion(
      {
        slug,
        scenario: inquiryResult.scenario,
        conclusion: inquiryResult.conclusion,
      },
      paths,
    );

    return {
      ok: true,
      leadSlug: slug,
      scenario: inquiryResult.scenario,
      confidence: inquiryResult.confidence,
      conclusion: inquiryResult.conclusion,
      allegationsCount: persisted.allegationPaths.length,
      findingsCount: persisted.findingPaths.length,
      allegations: inquiryResult.allegations,
      findings: inquiryResult.findings.map((f) => ({
        id: f.id,
        claim: f.claim,
        status: f.status,
        evidenceCount: f.evidence.length,
      })),
    };
  },
});
