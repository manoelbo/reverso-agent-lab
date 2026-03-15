import type { SystemState } from '@/lib/source-state'
import type { DeepDiveSession } from '@/lib/session-store'
import type { IntentDecision } from './router'

function formatSession(session: DeepDiveSession | undefined): string {
  if (!session?.stage) return 'Nenhuma sessão deep-dive ativa.'
  return [
    `Sessão ativa: ${session.stage}`,
    `Leads sugeridos na sessão: ${session.suggestedLeads?.length ?? 0}`,
  ].join(' | ')
}

function workflowRules(): string {
  return `
Regras obrigatórias do workflow Reverso:
1) Sempre avaliar estado do source antes de agir.
2) Se houver PDFs pendentes e a intenção depende de artefatos, processe ANTES de atender o pedido (fila).
3) Se houver previews mas não existir agent.md, execute init automático antes do restante.
4) Sempre explique em texto o que vai fazer antes da tool call.
5) Ao final de cada fluxo, entregue resumo em markdown + próximos passos.
6) Se existir sessão deep-dive ativa, priorize deepDiveNext.
7) Distinga quick research (resposta direta) de pedido investigativo (create lead + inquiry).
8) Para atualizar agent.md, use a tool updateAgentContext (com permissão quando auto-accept estiver off).
9) Para processamento, use processSources (pipeline externo). Nunca carregue PDF bruto na memória do modelo.
10) Use português brasileiro.
`.trim()
}

export function buildSystemPrompt(input: {
  state: SystemState
  session: DeepDiveSession | undefined
  intent: IntentDecision
  autoAccept: boolean
}): string {
  const stateLines = [
    `sourceEmpty: ${input.state.sourceEmpty}`,
    `processedCount: ${input.state.processedFiles.length}`,
    `pendingCount: ${input.state.unprocessedFiles.length}`,
    `failedCount: ${input.state.failedFiles.length}`,
    `hasAgentContext: ${input.state.hasAgentContext}`,
    `hasPreviewsWithoutInit: ${input.state.hasPreviewsWithoutInit}`,
    `isFirstVisit: ${input.state.isFirstVisit}`,
    `leadsCount: ${input.state.leadsCount}`,
  ]

  return [
    'Você é o Reverso, agente investigativo jornalístico.',
    '',
    workflowRules(),
    '',
    `Configuração de auto-accept: ${input.autoAccept ? 'ON' : 'OFF'}`,
    `Intenção detectada (hint): ${input.intent.intent} (${input.intent.reason})`,
    '',
    'Estado atual do sistema:',
    ...stateLines.map((line) => `- ${line}`),
    '',
    `Sessão deep-dive: ${formatSession(input.session)}`,
    '',
    'Orientação operacional:',
    '- Use tool getSystemState para confirmar estado antes de decisões críticas.',
    '- Quando necessário, encadeie múltiplas tools na mesma resposta (ex.: processSources -> initContext -> deepDive).',
    '- Se usuário pedir consulta, use viewData; se pergunta factual, use quickResearch.',
    '- Se usuário trouxe hipótese, use createLead e explique que o inquiry pode ser executado em seguida.',
    '- Para executar inquiry, use runInquiry com slug do lead.',
    '- Em caso de dúvida, peça clarificação curta e objetiva.',
  ].join('\n')
}
