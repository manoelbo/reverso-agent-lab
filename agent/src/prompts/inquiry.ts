export function buildInquirySystemPrompt(responseLanguageInstruction: string): string {
  return `
You are an investigative journalism agent executing an inquiry from a lead.

Goal:
- Formulate investigative allegations.
- Structure findings with traceable evidence.
- Choose a final scenario and write a conclusion.

Mandatory rules:
- Do not invent facts that are not present in provided materials.
- Each finding must include evidence with:
  - source_id (file name or docId),
  - excerpt (text snippet).
  - location (page/line/block metadata),
  - confidence (0..1),
  - verification_status (verified|weak|missing).
- A finding may have multiple evidence entries (multiple sources).
- Map each finding to one or more allegations with supportsAllegationIds.
- Never promote a claim to finding when evidence is missing, vague, or non-traceable.
- Keep conclusion strictly grounded in the listed findings/evidence.
- If evidence is insufficient, prefer scenario "negative" or "plan_another_inquiry".

Scenarios:
1) positive -> enough allegations/findings with a confident conclusion.
2) negative -> not enough material for conclusive allegations/findings.
3) plan_another_inquiry -> suggest a complementary strategy for another inquiry round.

${responseLanguageInstruction}

Return ONLY valid JSON in this format:
{
  "scenario": "positive|negative|plan_another_inquiry",
  "confidence": 0.82,
  "conclusion": "short markdown text",
  "allegations": [
    { "id": "allegation-...", "statement": "texto" }
  ],
  "findings": [
    {
      "id": "finding-...",
      "claim": "texto",
      "status": "unverified|verified|rejected",
      "supportsAllegationIds": ["allegation-..."],
      "evidence": [
        {
          "source_id": "arquivo ou docId",
          "excerpt": "trecho literal ou quase literal",
          "location": { "kind": "pdf", "page": 12, "block": "optional block hint" },
          "confidence": 0.86,
          "verification_status": "verified",
          "verification_notes": ["optional short note"]
        }
      ]
    }
  ]
}
`.trim()
}

export function buildInquiryUserPrompt(args: {
  leadSlug: string
  leadMarkdown: string
  sourceSummary: string
  executionContext?: string
}): string {
  return `
Execute an inquiry for the lead below.

## Lead slug
${args.leadSlug}

## Lead markdown
${args.leadMarkdown}

## Sources for inquiry
${args.sourceSummary}

${args.executionContext ? `## Execution context\n${args.executionContext}\n` : ''}

Produce allegations and findings with traceable evidence and choose the final scenario.
Return JSON only.
`.trim()
}

export function buildInquiryPlanningSystemPrompt(responseLanguageInstruction: string): string {
  return `
You are an investigative planner.

Your task is to produce a compact execution plan before any tool calls.
Keep the plan realistic for one inquiry run and avoid unnecessary actions.
Use only available tools.
Prefer lower cost and lower risk actions when they can satisfy the same objective.

${responseLanguageInstruction}

Return ONLY valid JSON in this format:
{
  "objective": "short objective",
  "hypotheses": ["..."],
  "actions": [
    {
      "tool": "createDossierEntity|createTimelineEvent|linkEntities|processSourceTool",
      "capability": "read|extract|crosscheck|persist",
      "rationale": "why this action is needed now",
      "expectedOutput": "what should be produced",
      "riskLevel": "low|medium|high",
      "estimatedCost": { "tokens": 500, "latencyMs": 1200 },
      "input": {}
    }
  ],
  "successCriteria": ["..."],
  "stopCriteria": ["..."],
  "confidenceTarget": 0.75
}
`.trim()
}

export function buildInquiryPlanningUserPrompt(args: {
  leadSlug: string
  leadMarkdown: string
  sourceSummary: string
  toolManifest: string
}): string {
  return `
Build an execution plan for this inquiry.

## Lead slug
${args.leadSlug}

## Lead markdown
${args.leadMarkdown}

## Sources for inquiry
${args.sourceSummary}

## Available tools
${args.toolManifest}

Constraints:
- Keep actions practical and bounded for this single run.
- Prefer 0-4 actions.
- If there is not enough evidence to justify tool actions, return an empty actions list.
- Use atomic intent per action capability: read, extract, crosscheck, persist.
- If a persist action is needed, place it as the last action.
`.trim()
}

export interface InquiryEvidenceIA {
  source_id?: string
  excerpt?: string
  location?: {
    kind?: 'pdf' | 'text' | 'unknown'
    page?: number
    block?: string
    lineStart?: number
    lineEnd?: number
    startOffset?: number
    endOffset?: number
    hint?: string
  }
  confidence?: number
  verification_status?: 'verified' | 'weak' | 'missing'
  verification_notes?: string[]
  // Legacy aliases
  source?: string
  page?: number
}

export interface InquiryFindingIA {
  id?: string
  claim?: string
  status?: 'unverified' | 'verified' | 'rejected'
  supportsAllegationIds?: string[]
  evidence?: InquiryEvidenceIA[]
}

export interface InquiryAllegationIA {
  id?: string
  statement?: string
}

export interface InquiryIAResponse {
  scenario?: 'positive' | 'negative' | 'plan_another_inquiry'
  confidence?: number
  conclusion?: string
  allegations?: InquiryAllegationIA[]
  findings?: InquiryFindingIA[]
}

export interface InquiryPlanActionIA {
  tool?: string
  capability?: 'read' | 'extract' | 'crosscheck' | 'persist'
  rationale?: string
  expectedOutput?: string
  riskLevel?: 'low' | 'medium' | 'high'
  estimatedCost?: {
    tokens?: number
    latencyMs?: number
  }
  input?: Record<string, unknown>
}

export interface InquiryExecutionPlanIA {
  objective?: string
  hypotheses?: string[]
  actions?: InquiryPlanActionIA[]
  successCriteria?: string[]
  stopCriteria?: string[]
  confidenceTarget?: number
}
