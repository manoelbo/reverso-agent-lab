/**
 * Prompt para o comando create-lead: IA retorna APENAS planejamento do lead.
 */

export function buildCreateLeadSystemPrompt(
  toolManifest: string,
  responseLanguageInstruction = ''
): string {
  return `
You are an investigative journalism assistant. Your task is to create an investigation lead with an inquiry plan.
This command MUST NOT produce allegations or findings now. Those are generated later by /inquiry.

${toolManifest}

Mandatory rules:
- Inquiry Plan must follow exactly these 4 stages:
  1) Formulate Allegations
  2) Define Search Strategy
  3) Gather Findings
  4) Map to Allegations
- Prioritize traceability and concrete steps over vague guidance.
- Do not invent data not supported by documents.

${responseLanguageInstruction}

Return ONLY valid JSON, with no markdown and no text before/after, in this format:
{
  "codename": "string (slug-friendly, e.g., slope-instability)",
  "title": "string",
  "description": "string",
  "inquiryPlan": {
    "formulateAllegations": ["item 1", "..."],
    "defineSearchStrategy": ["item 1", "..."],
    "gatherFindings": ["item 1", "..."],
    "mapToAllegations": ["item 1", "..."]
  }
}
`.trim()
}

export function buildCreateLeadUserPrompt(idea?: string, sourceSummary?: string): string {
  const sourceBlock = sourceSummary?.trim()
    ? `Available sources for this investigation:\n${sourceSummary.trim()}\n\nUse this list to suggest steps that reference specific documents when relevant.\n`
    : ''

  if (idea?.trim()) {
    return `
Create an investigation lead based on this idea/name: "${idea.trim()}"

${sourceBlock}

Fill codename, title, description, and inquiryPlan (4 stages).
Return JSON only.
`.trim()
  }
  return `
Create a generic investigation lead based on common reporting themes (public contracts, people, companies, values, deadlines).

${sourceBlock}

Fill codename, title, description, and inquiryPlan (4 stages).
Return JSON only.
`.trim()
}

export interface CreateLeadIAResponse {
  codename?: string
  title?: string
  description?: string
  inquiryPlan?: {
    formulateAllegations?: string[]
    defineSearchStrategy?: string[]
    gatherFindings?: string[]
    mapToAllegations?: string[]
  }
}
