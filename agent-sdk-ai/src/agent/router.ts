import { generateText, Output } from 'ai'
import { z } from 'zod'
import { resolveLanguageModel } from '@/lib/model'

export type ReversoIntent =
  | 'greeting'
  | 'process_documents'
  | 'quick_research'
  | 'view_data'
  | 'update_agent_context'
  | 'deep_dive'
  | 'deep_dive_next'
  | 'create_lead'
  | 'run_inquiry'
  | 'init'
  | 'general_chat'

export interface IntentDecision {
  intent: ReversoIntent
  confidence: number
  reason: string
}

const classifierOutput = Output.object({
  schema: z.object({
    intent: z.enum([
      'greeting',
      'process_documents',
      'quick_research',
      'view_data',
      'update_agent_context',
      'deep_dive',
      'deep_dive_next',
      'create_lead',
      'run_inquiry',
      'init',
      'general_chat',
    ]),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(3).max(240),
  }),
})

export function heuristicIntent(text: string): IntentDecision | undefined {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (
    ['oi', 'ola', 'olá', 'hello', 'hi', 'bom dia', 'boa tarde', 'boa noite'].some(
      (g) =>
        normalized === g ||
        normalized.startsWith(`${g} `) ||
        normalized.startsWith(`${g},`) ||
        normalized.startsWith(`${g}!`) ||
        normalized.startsWith(`${g}?`)
    )
  ) {
    return { intent: 'greeting', confidence: 0.96, reason: 'saudação direta' }
  }

  if (
    normalized.includes('processa') &&
    (normalized.includes('pdf') ||
      normalized.includes('arquivo') ||
      normalized.includes('documento'))
  ) {
    return { intent: 'process_documents', confidence: 0.94, reason: 'pedido explícito de processamento' }
  }

  if (
    normalized.includes('mostra') ||
    normalized.includes('listar') ||
    normalized.includes('lista os') ||
    normalized.includes('quais')
  ) {
    if (
      normalized.includes('lead') ||
      normalized.includes('dossie') ||
      normalized.includes('alegac') ||
      normalized.includes('finding') ||
      normalized.includes('fonte')
    ) {
      return { intent: 'view_data', confidence: 0.88, reason: 'consulta de dados existentes' }
    }
  }

  if (
    normalized.includes('atualiza') ||
    normalized.includes('adiciona contexto') ||
    normalized.includes('agent.md') ||
    normalized.includes('instrucoes')
  ) {
    return { intent: 'update_agent_context', confidence: 0.86, reason: 'pedido de atualização de contexto' }
  }

  if (normalized.includes('deep-dive') || normalized.includes('explora as fontes')) {
    return { intent: 'deep_dive', confidence: 0.86, reason: 'pedido de exploração investigativa' }
  }

  if (normalized.includes('continue') || normalized.includes('proximo passo') || normalized.includes('executa todos')) {
    return { intent: 'deep_dive_next', confidence: 0.81, reason: 'continuidade provável de sessão ativa' }
  }

  if (normalized.includes('cria lead') || normalized.includes('hipotese') || normalized.includes('hipótese')) {
    return { intent: 'create_lead', confidence: 0.84, reason: 'pedido de criação de lead' }
  }

  if (normalized.includes('inquiry') || normalized.includes('investiga o lead')) {
    return { intent: 'run_inquiry', confidence: 0.89, reason: 'pedido de execução de inquiry' }
  }

  if (normalized === 'init' || normalized.includes('inicializa')) {
    return { intent: 'init', confidence: 0.9, reason: 'pedido explícito de init' }
  }

  const hasQuestion =
    normalized.includes('?') ||
    normalized.startsWith('quem ') ||
    normalized.startsWith('qual ') ||
    normalized.startsWith('quais ') ||
    normalized.startsWith('o que ')
  if (hasQuestion) {
    return { intent: 'quick_research', confidence: 0.72, reason: 'pergunta objetiva' }
  }

  return undefined
}

export async function classifyIntent(userText: string): Promise<IntentDecision> {
  const heuristic = heuristicIntent(userText)
  if (heuristic) return heuristic

  const result = await generateText({
    model: resolveLanguageModel(),
    output: classifierOutput,
    temperature: 0,
    prompt: [
      'Classifique a intenção do usuário para um agente investigativo.',
      'Retorne apenas conforme schema.',
      '',
      `Texto: ${userText}`,
    ].join('\n'),
  })

  return {
    intent: result.output.intent,
    confidence: result.output.confidence,
    reason: result.output.reason,
  }
}
