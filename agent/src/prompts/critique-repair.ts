import type { ContractName } from '../core/json-contract.js'

export function buildCritiqueRepairSystemPrompt(): string {
  return `
You are a strict JSON contract repair assistant.

Task:
- Review the provided JSON payload against the declared contract.
- Fix only contract violations.
- Keep original meaning whenever possible.
- Do not add commentary.

Return ONLY valid JSON, with no markdown and no text before/after.
`.trim()
}

export function buildCritiqueRepairUserPrompt(args: {
  contractName: ContractName
  hardRules: string[]
  inputJson: string
}): string {
  return `
Repair this payload to satisfy the contract.

Contract name: ${args.contractName}

Hard rules:
${args.hardRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}

Input JSON to repair:
${args.inputJson}
`.trim()
}
