export function extractLatestUserText(messages: unknown[]): string {
  const lastUser = [...messages]
    .reverse()
    .find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as Record<string, unknown>)['role'] === 'user'
    ) as Record<string, unknown> | undefined

  if (!lastUser) return ''
  const parts = Array.isArray(lastUser['parts']) ? (lastUser['parts'] as unknown[]) : []
  const textParts = parts.filter(
    (part) =>
      typeof part === 'object' &&
      part !== null &&
      (part as Record<string, unknown>)['type'] === 'text' &&
      typeof (part as Record<string, unknown>)['text'] === 'string'
  ) as Array<Record<string, string>>

  return textParts.map((part) => part.text).join('\n').trim()
}

export function normalizeMessages(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function nextStepSuggestion(intent: string): string {
  if (intent === 'deep_dive' || intent === 'deep_dive_next') {
    return 'Você pode aprovar uma linha sugerida para executar inquiry em seguida.'
  }
  if (intent === 'create_lead') {
    return 'Próximo passo recomendado: executar inquiry no lead criado para validar evidências.'
  }
  if (intent === 'run_inquiry') {
    return 'Revise alegações/findings no painel e decida quais itens devem ser confirmados ou rejeitados.'
  }
  if (intent === 'process_documents') {
    return 'Com as fontes processadas, você pode pedir init ou iniciar um deep-dive.'
  }
  return 'Se quiser, peça um deep-dive, consulta rápida ou criação de lead investigativo.'
}
