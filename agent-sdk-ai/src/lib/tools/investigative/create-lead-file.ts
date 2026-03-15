import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { InquiryPlan, InquiryScenario, LeadAllegation, LeadFinding } from '../../core/contracts';
import { formatFrontmatter } from '../../core/markdown';
import { ensureDir, writeUtf8, slugify } from '../../filesystem/io';
import type { AgentPaths } from '../../filesystem/paths';

// ─── Create Lead File ──────────────────────────────────────────────────────

export interface CreateLeadFileInput {
  slug: string;
  title: string;
  description: string;
  language?: string;
  inquiryPlan?: InquiryPlan;
  status?: 'draft' | 'planned';
}

export async function createLeadFile(
  input: CreateLeadFileInput,
  paths: AgentPaths,
): Promise<{ leadPath: string }> {
  await ensureDir(paths.leadsDir);

  const status = input.status ?? 'draft';
  const frontmatter = formatFrontmatter({
    type: 'investigation_lead',
    title: input.title,
    slug: input.slug,
    status,
    language: input.language ?? 'en',
    created_at: new Date().toISOString(),
  });

  const sections: string[] = [frontmatter, '', `# ${input.title}`, ''];

  if (input.description) {
    sections.push('## Context', '', input.description, '');
  }

  if (input.inquiryPlan) {
    sections.push('## Inquiry Plan', '');
    sections.push('### Formulate Allegations');
    for (const item of input.inquiryPlan.formulateAllegations) {
      sections.push(`- ${item}`);
    }
    sections.push('');
    sections.push('### Define Search Strategy');
    for (const item of input.inquiryPlan.defineSearchStrategy) {
      sections.push(`- ${item}`);
    }
    sections.push('');
    sections.push('### Gather Findings');
    for (const item of input.inquiryPlan.gatherFindings) {
      sections.push(`- ${item}`);
    }
    sections.push('');
    sections.push('### Map to Allegations');
    for (const item of input.inquiryPlan.mapToAllegations) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }

  const leadPath = path.join(paths.leadsDir, `lead-${input.slug}.md`);
  await writeUtf8(leadPath, sections.join('\n'));

  return { leadPath };
}

// ─── Update Lead Status ─────────────────────────────────────────────────────

export async function updateLeadPlanAndStatus(
  input: {
    slug: string;
    inquiryPlan: InquiryPlan;
    status: 'planned';
    language?: string;
  },
  paths: AgentPaths,
): Promise<void> {
  const leadPath = path.join(paths.leadsDir, `lead-${input.slug}.md`);
  let content: string;
  try {
    content = await readFile(leadPath, 'utf8');
  } catch {
    return; // Lead file not found
  }

  // Update status in frontmatter
  content = content.replace(/^status:\s+.+$/m, `status: ${input.status}`);

  // Append or update inquiry plan
  if (!content.includes('## Inquiry Plan')) {
    const planSection = [
      '\n## Inquiry Plan\n',
      '### Formulate Allegations',
      ...input.inquiryPlan.formulateAllegations.map((i) => `- ${i}`),
      '',
      '### Define Search Strategy',
      ...input.inquiryPlan.defineSearchStrategy.map((i) => `- ${i}`),
      '',
      '### Gather Findings',
      ...input.inquiryPlan.gatherFindings.map((i) => `- ${i}`),
      '',
      '### Map to Allegations',
      ...input.inquiryPlan.mapToAllegations.map((i) => `- ${i}`),
      '',
    ].join('\n');
    content += planSection;
  }

  await writeUtf8(leadPath, content);
}

// ─── Append Conclusion ──────────────────────────────────────────────────────

export async function appendLeadConclusion(
  input: {
    slug: string;
    scenario: InquiryScenario;
    conclusion: string;
    language?: string;
  },
  paths: AgentPaths,
): Promise<string> {
  const leadPath = path.join(paths.leadsDir, `lead-${input.slug}.md`);
  let content: string;
  try {
    content = await readFile(leadPath, 'utf8');
  } catch {
    throw new Error(`Lead file not found: lead-${input.slug}.md`);
  }

  const conclusionSection = [
    '',
    '## Inquiry Conclusion',
    '',
    `**Scenario:** ${input.scenario}`,
    `**Date:** ${new Date().toISOString()}`,
    '',
    input.conclusion,
    '',
  ].join('\n');

  content += conclusionSection;
  await writeUtf8(leadPath, content);
  return leadPath;
}

// ─── Persist Inquiry Artifacts ──────────────────────────────────────────────

export async function persistInquiryArtifacts(
  input: {
    slug: string;
    language?: string;
    allegations: LeadAllegation[];
    findings: LeadFinding[];
  },
  paths: AgentPaths,
): Promise<{ allegationPaths: string[]; findingPaths: string[] }> {
  await ensureDir(paths.allegationsDir);
  await ensureDir(paths.findingsDir);

  const allegationPaths: string[] = [];
  const findingPaths: string[] = [];

  for (const allegation of input.allegations) {
    const fileName = `${input.slug}-${slugify(allegation.id)}.md`;
    const filePath = path.join(paths.allegationsDir, fileName);
    const content = [
      formatFrontmatter({
        type: 'allegation',
        id: allegation.id,
        lead_slug: `lead-${input.slug}`,
        created_at: new Date().toISOString(),
      }),
      '',
      `# ${allegation.statement}`,
      '',
      `**Lead:** lead-${input.slug}`,
      '',
    ].join('\n');
    await writeUtf8(filePath, content);
    allegationPaths.push(filePath);
  }

  for (const finding of input.findings) {
    const fileName = `${input.slug}-${slugify(finding.id)}.md`;
    const filePath = path.join(paths.findingsDir, fileName);
    const evidenceLines = finding.evidence.map(
      (e) =>
        `- **${e.source_id}** (confidence: ${e.confidence.toFixed(2)}): "${e.excerpt}"`,
    );
    const content = [
      formatFrontmatter({
        type: 'finding',
        id: finding.id,
        lead_slug: `lead-${input.slug}`,
        status: finding.status,
        supports_allegations: finding.supportsAllegationIds,
        created_at: new Date().toISOString(),
      }),
      '',
      `# ${finding.claim}`,
      '',
      `**Status:** ${finding.status}`,
      `**Supports:** ${finding.supportsAllegationIds.join(', ') || 'none'}`,
      '',
      '## Evidence',
      '',
      ...evidenceLines,
      '',
    ].join('\n');
    await writeUtf8(filePath, content);
    findingPaths.push(filePath);
  }

  return { allegationPaths, findingPaths };
}
