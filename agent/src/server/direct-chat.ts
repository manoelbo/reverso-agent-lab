import type http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { OpenRouterClient, type TokenUsage } from '../llm/openrouter-client.js'
import { emit } from './sse-emitter.js'
import type { RoutingContext } from './routing-context.js'
import { loadChatSession, type PersistedMessage } from './chat-session.js'
import type { DeepDiveSessionState } from '../core/deep-dive-session.js'

/** 1 token ≈ 4 chars; budget for history (excludes system + current user turn). */
const HISTORY_TOKEN_BUDGET = 6_000
const CHARS_PER_TOKEN = 4

/** Compaction thresholds */
const ALWAYS_FULL_PAIRS = 2    // recent pairs never truncated
const PRUNE_PER_MESSAGE = 500  // chars per message in level-1 prune
const TRIM_PER_MESSAGE = 120   // chars per message in level-2 trim

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...(truncado)`
}

/**
 * Build a history from persisted messages with two-level compaction.
 *
 * Level 1 (prune): old pairs with > 1000 combined chars are truncated to
 * PRUNE_PER_MESSAGE chars per message before checking budget.
 * Level 2 (trim): if a pruned pair still won't fit, try TRIM_PER_MESSAGE;
 * if it still won't fit, skip the pair entirely.
 * The most recent ALWAYS_FULL_PAIRS are always included in full.
 */
function buildHistory(
  messages: PersistedMessage[],
  tokenBudget: number,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const charBudget = tokenBudget * CHARS_PER_TOKEN

  // Collect chronological pairs (user + assistant)
  const pairs: Array<[PersistedMessage, PersistedMessage]> = []
  for (let i = messages.length - 1; i >= 1; i -= 2) {
    const assistant = messages[i]
    const user = messages[i - 1]
    if (assistant?.role === 'assistant' && user?.role === 'user') {
      pairs.push([user, assistant])
    }
  }
  // pairs is newest-first; reverse to get chronological order
  pairs.reverse()

  const recentPairs = pairs.slice(-ALWAYS_FULL_PAIRS)
  const oldPairs = pairs.slice(0, pairs.length - ALWAYS_FULL_PAIRS)

  // Reserve chars for recent pairs (always included in full)
  let usedChars = recentPairs.reduce(
    (acc, [u, a]) => acc + u.text.length + a.text.length,
    0,
  )

  // Collect old pairs newest-first, applying compaction
  const compacted: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (let i = oldPairs.length - 1; i >= 0; i--) {
    const pair = oldPairs[i]
    if (!pair) continue
    const [user, assistant] = pair
    const fullChars = user.text.length + assistant.text.length

    // Try full
    if (usedChars + fullChars <= charBudget) {
      compacted.unshift({ role: 'assistant', content: assistant.text })
      compacted.unshift({ role: 'user', content: user.text })
      usedChars += fullChars
      continue
    }

    // Try pruned (level 1)
    const pruneU = truncate(user.text, PRUNE_PER_MESSAGE)
    const pruneA = truncate(assistant.text, PRUNE_PER_MESSAGE)
    const pruneChars = pruneU.length + pruneA.length
    if (usedChars + pruneChars <= charBudget) {
      compacted.unshift({ role: 'assistant', content: pruneA })
      compacted.unshift({ role: 'user', content: pruneU })
      usedChars += pruneChars
      continue
    }

    // Try trimmed (level 2)
    const trimU = truncate(user.text, TRIM_PER_MESSAGE)
    const trimA = truncate(assistant.text, TRIM_PER_MESSAGE)
    const trimChars = trimU.length + trimA.length
    if (usedChars + trimChars <= charBudget) {
      compacted.unshift({ role: 'assistant', content: trimA })
      compacted.unshift({ role: 'user', content: trimU })
      usedChars += trimChars
      continue
    }

    // Pair doesn't fit even trimmed — stop adding older pairs
    break
  }

  // Append recent pairs in full (always included)
  const result = [...compacted]
  for (const [user, assistant] of recentPairs) {
    result.push({ role: 'user', content: user.text })
    result.push({ role: 'assistant', content: assistant.text })
  }

  return result
}

function buildDeepDiveSummary(session: DeepDiveSessionState): string {
  const lines = ['## Sessão de análise ativa (deep-dive)']
  lines.push(`- Stage: ${session.stage}`)
  if (session.reportPath) lines.push(`- Relatório: ${session.reportPath}`)
  if (session.suggestedLeads.length > 0) {
    lines.push(`- Leads sugeridos: ${session.suggestedLeads.map((l) => l.title).join(', ')}`)
  }
  return lines.join('\n')
}

function buildSystemPrompt(agentMd?: string, session?: DeepDiveSessionState): string {
  const base = [
    'Você é o Reverso, um agente de investigação jornalística (OSINT).',
    'Responda sempre em Português Brasileiro.',
    'Seja direto, claro e útil. Não execute ações — apenas converse.',
  ].join('\n')

  const parts = [base]
  if (agentMd) {
    parts.push(`## Contexto da investigação (agent.md)\n\n${agentMd}`)
  }
  if (session) {
    parts.push(buildDeepDiveSummary(session))
  }
  return parts.join('\n\n')
}

export async function streamDirectChat(
  text: string,
  ctx: RoutingContext,
  res: http.ServerResponse,
  sessionId: string,
  options?: { systemOverride?: string },
): Promise<string> {
  let agentMd: string | undefined
  try {
    agentMd = await readFile(path.join(ctx.runtime.paths.outputDir, 'agent.md'), 'utf8')
  } catch {
    // arquivo pode não existir — ok
  }

  // Load persisted history and build sliding-window context
  const chatSession = await loadChatSession(sessionId)
  const history = buildHistory(chatSession.messages, HISTORY_TOKEN_BUDGET)

  if (history.length > 0) {
    console.log(
      `[direct-chat] Including ${history.length / 2} prior turn(s) in context (session: ${sessionId})`,
    )
  }

  const client = new OpenRouterClient(ctx.runtime.apiKey)
  let fullText = ''
  let capturedUsage: TokenUsage | undefined

  await client.chatTextStream({
    model: ctx.runtime.model,
    system: options?.systemOverride ?? buildSystemPrompt(agentMd, ctx.session),
    history,
    user: text,
    onChunk(delta) {
      fullText += delta
      emit(res, 'text-delta', { delta, fullText })
    },
    onUsage(usage) {
      capturedUsage = usage
    },
  })

  if (capturedUsage) {
    emit(res, 'token-usage', capturedUsage as unknown as Record<string, unknown>)
  }

  return fullText
}
