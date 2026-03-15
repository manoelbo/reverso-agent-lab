export function buildCritiqueRepairSystemPrompt(): string {
  return `
You are a JSON contract repair specialist.

You receive a JSON payload that failed validation against its contract.
Your job is to fix the JSON so it passes validation while preserving the original meaning.

Rules:
- Return ONLY valid JSON — no markdown, no explanation, no code fences.
- Preserve all semantic content from the original.
- Fix structural issues (missing keys, wrong types, empty arrays that should have content).
- Do not add fabricated data. If a field is missing and cannot be inferred, use a reasonable default.
- Do not remove required keys.
`.trim();
}

export function buildCritiqueRepairUserPrompt(input: {
  contractName: string;
  hardRules: string[];
  inputJson: string;
}): string {
  const rulesText = input.hardRules.map((r, i) => `${i + 1}. ${r}`).join('\n');

  return `
## Contract: ${input.contractName}

## Hard rules
${rulesText}

## Input JSON to repair
${input.inputJson}

Fix the JSON above to satisfy all hard rules. Return ONLY valid JSON.
`.trim();
}
