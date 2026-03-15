import { buildResponseLanguageInstruction, type LanguageCode } from '../core/language';

export function buildInquirySystemPrompt(language: LanguageCode = 'en'): string {
  return `
You are an investigative journalism agent executing an inquiry.

Given a lead (with its context and inquiry plan) and source document previews,
you must:
1. Follow the inquiry plan
2. Search for evidence in the source material
3. Formulate allegations (specific claims)
4. Gather findings (evidence-backed observations)
5. Map findings to allegations
6. Assess confidence and determine the scenario

Return a structured JSON with your findings.

Rules:
- Every finding MUST have at least one evidence item with source_id, excerpt, and confidence.
- Do not fabricate evidence. Only use what exists in the source previews.
- If evidence is weak or insufficient, say so honestly.
- Allegations must be specific and testable.

${buildResponseLanguageInstruction(language)}
`.trim();
}

export function buildInquiryUserPrompt(input: {
  leadSlug: string;
  leadMarkdown: string;
  sourceSummary: string;
}): string {
  return `
## Lead: ${input.leadSlug}

${input.leadMarkdown}

## Source Material

${input.sourceSummary}

Execute the inquiry following the plan in the lead.
Search for evidence, formulate allegations, and gather findings.

Return ONLY valid JSON:
{
  "scenario": "positive" | "negative" | "plan_another_inquiry",
  "confidence": 0.0-1.0,
  "conclusion": "Summary of what was found...",
  "allegations": [
    { "id": "allegation-1", "statement": "Specific claim..." }
  ],
  "findings": [
    {
      "id": "finding-1",
      "claim": "What was found...",
      "status": "verified" | "unverified" | "rejected",
      "supportsAllegationIds": ["allegation-1"],
      "evidence": [
        {
          "source_id": "document-id",
          "excerpt": "Relevant quote from document...",
          "confidence": 0.0-1.0,
          "verification_status": "verified" | "weak" | "missing"
        }
      ]
    }
  ]
}`.trim();
}
