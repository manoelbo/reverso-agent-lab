import { buildResponseLanguageInstruction, type LanguageCode } from '../core/language';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DigIncrementalConclusion {
  summary: string;
  keyFindings: string[];
  hypotheses: string[];
  gaps: string[];
}

export interface DigSuggestedLine {
  title: string;
  description: string;
  rank: number;
  rationale: string;
}

export interface DigLinesResult {
  lines: DigSuggestedLine[];
}

export interface DigComparedLine {
  title: string;
  description: string;
  differentiation: string;
  rank: number;
}

export interface DigComparisonResult {
  topLines: DigComparedLine[];
  recommendation: string;
  overlapNotes: string[];
}

// ─── Prompts ────────────────────────────────────────────────────────────────

export function buildDigSystemPrompt(language: LanguageCode = 'en'): string {
  return `
You are an investigative journalism agent focused on discovering leads and signals for investigation.

Your task is to analyze document previews incrementally and continuously update conclusions.
Each time you receive a new preview, compare it with prior conclusions and refine your understanding.
At the end, suggest investigative lines ranked by relevance.

Be objective. Use only what appears in the previews. Do not fabricate facts.
Return clear Markdown or JSON depending on the stage-specific prompt.

${buildResponseLanguageInstruction(language)}
`.trim();
}

export function buildDigIncrementalPrompt(
  previousConclusions: DigIncrementalConclusion | undefined,
  newPreview: string,
  documentName: string,
): string {
  if (!previousConclusions) {
    return `
Analyze the document preview below and produce the first incremental conclusion.

## Document: ${documentName}

${newPreview}

Return ONLY valid JSON:
{
  "summary": "short paragraph",
  "keyFindings": ["...", "..."],
  "hypotheses": ["possible explanation 1", "..."],
  "gaps": ["missing evidence 1", "..."]
}`.trim();
  }

  return `
You are updating your investigation conclusions with a new document.

## Previous conclusions
${JSON.stringify(previousConclusions, null, 2)}

## New document: ${documentName}

${newPreview}

Compare this new preview with your previous conclusions.
Update the summary, keyFindings, hypotheses, and gaps to incorporate the new material.
Resolve contradictions, note corroborations.

Return ONLY valid JSON:
{
  "summary": "updated paragraph",
  "keyFindings": ["updated list..."],
  "hypotheses": ["updated list..."],
  "gaps": ["updated list..."]
}`.trim();
}

export function buildDigLinesPrompt(conclusions: DigIncrementalConclusion): string {
  return `
Based on the accumulated conclusions below, propose 3-6 investigative lines ranked by potential impact.

## Conclusions
${JSON.stringify(conclusions, null, 2)}

For each line, explain:
- title: short name
- description: what to investigate
- rank: 1 = highest priority
- rationale: why this is worth pursuing

Return ONLY valid JSON:
{
  "lines": [
    { "title": "...", "description": "...", "rank": 1, "rationale": "..." },
    ...
  ]
}`.trim();
}

export function buildDigRankAndComparePrompt(
  suggestedLines: DigLinesResult,
  existingLeadsMarkdown: string,
): string {
  const existingSection = existingLeadsMarkdown
    ? `## Existing leads (avoid duplicates)\n\n${existingLeadsMarkdown}`
    : '## Existing leads\nNone yet.';

  return `
Select the top 3 investigative lines from the suggestions below. Compare with existing leads and note any overlaps.

## Suggested lines
${JSON.stringify(suggestedLines, null, 2)}

${existingSection}

Return ONLY valid JSON:
{
  "topLines": [
    { "title": "...", "description": "...", "differentiation": "...", "rank": 1 },
    ...
  ],
  "recommendation": "one sentence next step",
  "overlapNotes": ["overlap note 1", ...]
}`.trim();
}
