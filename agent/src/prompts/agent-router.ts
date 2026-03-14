export type AgentRouterIntent =
  | 'continue_session'
  | 'start_deep_dive'
  | 'run_init'
  | 'request_context'
  | 'describe_investigation'
  | 'create_lead'
  | 'plan_inquiry'
  | 'run_inquiry'
  // New intents (E2)
  | 'greeting'
  | 'quick_research'
  | 'view_data'
  | 'update_agent_context'
  | 'process_documents'
  | 'general_chat'
  | 'abort_current'
  | 'unknown'

export interface SourceStateContext {
  sourceEmpty: boolean
  unprocessedCount: number
  processedCount: number
  failedCount: number
  unprocessedFileNames: string[]
  isFirstVisit: boolean
}

function formatSourceState(state?: SourceStateContext): string {
  if (!state) return 'unknown'
  if (state.sourceEmpty) return 'empty (no source files)'
  const parts: string[] = []
  if (state.unprocessedCount > 0) {
    const names = state.unprocessedFileNames.slice(0, 3).join(', ')
    const more = state.unprocessedCount > 3 ? ` +${state.unprocessedCount - 3} more` : ''
    parts.push(`${state.unprocessedCount} unprocessed file(s) (${names}${more})`)
  }
  if (state.processedCount > 0) {
    parts.push(`${state.processedCount} processed file(s)`)
  }
  if (state.failedCount > 0) {
    parts.push(`${state.failedCount} failed file(s)`)
  }
  return parts.join(', ')
}

export function buildAgentRouterSystemPrompt(): string {
  return `
You classify the next action for an investigative journalist agent (Reverso).

Return ONLY valid JSON:
{
  "intent": "<intent>",
  "targetSlug": "lead-slug-optional",
  "targetTitle": "lead title optional",
  "targetIndex": 1,
  "targetScope": "one|all",
  "targetCount": 3,
  "idea": "optional lead idea",
  "confidence": 0.8,
  "reason": "one short sentence"
}

Available intents and when to use them:

- continue_session: User is continuing a previously suggested step ("plan all", "execute first", "redo", "continue", "continuar", "refaz").
- start_deep_dive: User wants to inspect sources, discover investigative leads, or start an investigation ("deep-dive", "analise as fontes", "sugira leads", "start investigation").
- run_init: User wants initial context setup ("init", "iniciar agente", "contexto inicial").
- request_context: User wants to review/summarize current documents and context ("olhe meus documentos", "resumo do contexto").
- describe_investigation: User is describing the case context without a concrete action ("minha investigação é sobre", "o caso envolve").
- create_lead: User explicitly asks to create an investigative lead ("cria um lead", "create a lead").
- plan_inquiry: User wants to create/update inquiry plans for existing leads ("planeja os leads", "cria plano").
- run_inquiry: User asks to execute investigation for lead(s) ("investiga o lead", "executa inquiry", "investigate leads").
- greeting: User is greeting or asking how the platform works ("oi", "olá", "hello", "hi", "como você funciona", "o que você faz", "what is this", "bom dia").
- quick_research: User asks a specific factual question about document content ("quem é X", "qual o valor do contrato", "who is X in the documents").
- view_data: User wants to see/list existing data without starting new work ("mostra os leads", "lista as alegações", "quais fontes foram processadas", "show leads", "list findings").
- update_agent_context: User explicitly wants to update the investigation context/memory ("atualiza o contexto", "adiciona contexto", "update context", "quero adicionar ao agente").
- process_documents: User explicitly asks to process documents ("processa os PDFs", "processa os arquivos", "process files", "processar documentos").
- general_chat: General conversation without a specific investigative intent ("o que você acha de X", "me explica Y", "what do you think").
- abort_current: User wants to cancel an ongoing operation ("para", "cancela", "stop", "abort", "esquece isso", "cancela a operação").
- unknown: Intent is unclear; use only as last resort.

Additional rules:
- Prefer continue_session when user clearly continues a previous step.
- greeting is for short greetings AND "how does this work?" questions.
- view_data is for listing/viewing existing data (NOT starting new work).
- quick_research is for specific factual questions answered from document content.
- general_chat is for casual conversation without investigative intent.
- abort_current only when user explicitly wants to stop ("para", "cancela", "stop", "abort").
- targetSlug: optional, provide when user names a lead slug.
- targetTitle: optional, when user references lead by title.
- targetIndex: optional, 1-based, when user references first/second/third.
- targetScope: "all" for "all leads"/"todos os leads", else "one".
- targetCount: optional, when user mentions a specific quantity.
- confidence must be between 0 and 1.
`.trim()
}

export function buildAgentRouterUserPrompt(input: {
  userText: string
  sessionStage?: 'awaiting_plan_decision' | 'awaiting_inquiry_execution' | 'completed'
  hasAgentContext: boolean
  availableLeads: Array<{ index: number; slug: string; title: string; status: 'draft' | 'planned' }>
  sourceState?: SourceStateContext
}): string {
  const leads =
    input.availableLeads.length > 0
      ? input.availableLeads
          .map((lead) => `${lead.index}. ${lead.title} (${lead.slug}) [${lead.status}]`)
          .join('\n')
      : '(none)'

  const sourceStateLine = `Source state: ${formatSourceState(input.sourceState)}`
  const firstVisitLine = input.sourceState
    ? `Is first visit (no history, no agent.md): ${input.sourceState.isFirstVisit ? 'yes' : 'no'}`
    : ''

  return `
Session stage: ${input.sessionStage ?? 'none'}
Has agent context (agent.md): ${input.hasAgentContext ? 'yes' : 'no'}
${sourceStateLine}
${firstVisitLine}

Available leads:
${leads}

User message:
${input.userText}
`.trim()
}
