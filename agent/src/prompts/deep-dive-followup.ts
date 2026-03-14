export type DeepDiveFollowupIntent =
  | 'plan_all'
  | 'plan_one'
  | 'redo'
  | 'execute_all'
  | 'execute_one'
  | 'hold'
  | 'unknown'

export function buildDeepDiveFollowupSystemPrompt(): string {
  return `
You classify user follow-up intent for an investigative agent workflow.

Return ONLY valid JSON:
{
  "intent": "plan_all|plan_one|redo|execute_all|execute_one|hold|unknown",
  "targetSlug": "lead-slug-optional",
  "targetTitle": "lead title optional",
  "targetIndex": 1,
  "confidence": 0.8
}

Rules:
- targetIndex is required only for plan_one or execute_one (1-based).
- targetSlug or targetTitle may be used for plan_one or execute_one when user explicitly references a lead by slug/title.
- If user asks to discard and search again, intent=redo.
- If user asks to make plan for all leads, intent=plan_all.
- If user asks to execute inquiry for all leads, intent=execute_all.
- If user asks to wait/stop, intent=hold.
`.trim()
}

export function buildDeepDiveFollowupUserPrompt(input: {
  stage: 'awaiting_plan_decision' | 'awaiting_inquiry_execution'
  userText: string
  availableLeads: Array<{ index: number; slug: string; title: string }>
}): string {
  const leads = input.availableLeads
    .map((lead) => `${lead.index}. ${lead.title} (${lead.slug})`)
    .join('\n')
  return `
Stage: ${input.stage}

Available leads:
${leads || '(none)'}

User response:
${input.userText}
`.trim()
}

