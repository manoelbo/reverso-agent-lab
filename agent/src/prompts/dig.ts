/**
 * Prompts e tipos para o comando dig: agente investigativo procurando leads,
 * atualização incremental de conclusões, geração e ranqueamento de linhas investigativas.
 */

export interface DigConclusion {
  summary: string
  keyFindings: string[]
  updatedAt: string
}

export interface DigIncrementalConclusion {
  summary: string
  keyFindings: string[]
  hypotheses: string[]
  gaps: string[]
}

export interface DigSuggestedLine {
  title: string
  description: string
  rank: number
  rationale: string
  relatedDocIds?: string[]
}

export interface DigLinesResult {
  lines: DigSuggestedLine[]
}

export interface DigComparedLine {
  title: string
  description: string
  differentiation: string
  rank: number
}

export interface DigFinalResult {
  topLines: DigComparedLine[]
  recommendation: string
  overlapNotes: string[]
}

export type DigComparisonResult = DigFinalResult

export function buildDigSystemPrompt(responseLanguageInstruction: string): string {
  return `
You are an investigative journalism agent focused on discovering leads and signals for investigation.

Your task is to analyze document previews incrementally and continuously update conclusions.
Each time you receive a new preview, compare it with prior conclusions and refine your understanding.
At the end, suggest investigative lines ranked by relevance.

Be objective. Use only what appears in the previews. Do not fabricate facts.
Return clear Markdown or JSON depending on the stage-specific prompt.

${responseLanguageInstruction}
`.trim()
}

export function buildDigIncrementalPrompt(
  previousConclusions: DigIncrementalConclusion | undefined,
  newPreview: string,
  documentName: string
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
}
`.trim()
  }
  return `
You already have accumulated conclusions from previous document analysis. Now read a new preview and update those conclusions.

--- PREVIOUS CONCLUSION ---
${JSON.stringify(previousConclusions, null, 2)}
--- END PREVIOUS CONCLUSION ---

--- NEW DOCUMENT: ${documentName} ---
${newPreview}
--- END NEW DOCUMENT ---

Update the conclusion object:
- keep what remains valid,
- incorporate findings from the new document,
- include contradictions/reinforcements in keyFindings,
- update hypotheses and gaps.

Return ONLY valid JSON:
{
  "summary": "updated paragraph",
  "keyFindings": ["...", "..."],
  "hypotheses": ["...", "..."],
  "gaps": ["...", "..."]
}
`.trim()
}

export function buildDigLinesPrompt(conclusions: DigIncrementalConclusion): string {
  return `
Based on the accumulated conclusions below, list possible investigative lines.

--- ACCUMULATED CONCLUSION ---
${JSON.stringify(conclusions, null, 2)}
--- END ---

Rules:
- Return 3 to 6 lines.
- Rank starts at 1 and increases without duplicates.
- Keep each description objective and evidence-oriented.

Return ONLY valid JSON:
{
  "lines": [
    {
      "title": "short title",
      "description": "1-2 sentence description",
      "rank": 1,
      "rationale": "why this matters now",
      "relatedDocIds": ["doc-1", "doc-2"]
    }
  ]
}
`.trim()
}

export function buildDigRankAndComparePrompt(
  suggestedLines: DigLinesResult,
  existingLeadsMarkdown: string
): string {
  return `
You suggested the following investigative lines from analyzed previews:

--- SUGGESTIONS ---
${JSON.stringify(suggestedLines, null, 2)}
--- END SUGGESTIONS ---

Now compare them with the leads that already exist in the workspace:

--- EXISTING LEADS ---
${existingLeadsMarkdown || '(No leads recorded yet.)'}
--- END EXISTING LEADS ---

Tasks:
1. Select the 3 most promising lines from your suggestions (avoid duplicating what already exists).
2. For each of the 3, write a short paragraph explaining why it matters and how it differs from existing leads (if any).
3. Provide overlap notes about potential duplicates or conflicts.
4. End with a one-line recommendation indicating which lead to create first and why.

Return ONLY valid JSON:
{
  "topLines": [
    {
      "title": "line title",
      "description": "line description",
      "differentiation": "how this differs from existing leads",
      "rank": 1
    }
  ],
  "recommendation": "one sentence recommendation",
  "overlapNotes": ["note 1", "note 2"]
}
`.trim()
}
