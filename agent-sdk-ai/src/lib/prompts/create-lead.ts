import { buildResponseLanguageInstruction, type LanguageCode } from '../core/language';

export function buildCreateLeadSystemPrompt(language: LanguageCode = 'en'): string {
  return `
You are an investigative journalism agent creating a structured investigation lead.

Given the user's hypothesis (or a free-form investigation idea) and available source material,
you must create a lead with:
1. A codename (slug-friendly identifier)
2. A title (clear, descriptive)
3. A description (what this investigation is about)
4. An inquiry plan with 4 phases:
   - formulateAllegations: what allegations to formulate
   - defineSearchStrategy: how to search for evidence
   - gatherFindings: what findings to look for
   - mapToAllegations: how findings connect to allegations

Return ONLY valid JSON.

${buildResponseLanguageInstruction(language)}
`.trim();
}

export function buildCreateLeadUserPrompt(
  idea?: string,
  sourceSummary?: string,
): string {
  const ideaSection = idea
    ? `## User's hypothesis\n\n${idea}`
    : '## Free-form lead\nGenerate an investigation lead based on the available source material.';

  const sourceSection = sourceSummary
    ? `## Available source material\n\n${sourceSummary}`
    : '## Source material\nNo source summary available.';

  return `
${ideaSection}

${sourceSection}

Create a structured investigation lead.

Return ONLY valid JSON:
{
  "codename": "slug-identifier",
  "title": "Investigation Title",
  "description": "What this investigation is about...",
  "inquiryPlan": {
    "formulateAllegations": ["allegation 1", "..."],
    "defineSearchStrategy": ["strategy 1", "..."],
    "gatherFindings": ["finding to look for 1", "..."],
    "mapToAllegations": ["mapping 1", "..."]
  }
}`.trim();
}
