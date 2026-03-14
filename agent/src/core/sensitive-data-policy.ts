import { createHash } from 'node:crypto'

export type SensitiveDataPolicyMode = 'off' | 'warn' | 'strict'
export type SensitiveDataSanitizationStrategy = 'mask' | 'redact' | 'hash'
export type SensitiveDataKind = 'email' | 'phone' | 'cpf' | 'cnpj' | 'api_token'

export interface SensitiveDataMatch {
  kind: SensitiveDataKind
  value: string
  start: number
  end: number
  replacement: string
}

export interface SanitizeForLlmResult {
  sanitizedText: string
  mode: SensitiveDataPolicyMode
  strategy: SensitiveDataSanitizationStrategy
  matches: SensitiveDataMatch[]
  blocked: boolean
}

const DETECTORS: Array<{ kind: SensitiveDataKind; regex: RegExp }> = [
  { kind: 'email', regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'phone', regex: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}-?\d{4}\b/g },
  { kind: 'cpf', regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g },
  { kind: 'cnpj', regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g },
  {
    kind: 'api_token',
    regex:
      /\b(?:sk-[a-z0-9]{16,}|ghp_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{10,}|api[_-]?key[\s:=]+[a-z0-9_-]{12,})\b/gi
  }
]

export function sanitizeForLlm(input: {
  text: string
  mode: SensitiveDataPolicyMode
  strategy?: SensitiveDataSanitizationStrategy
}): SanitizeForLlmResult {
  const strategy = input.strategy ?? 'mask'
  if (input.mode === 'off') {
    return {
      sanitizedText: input.text,
      mode: input.mode,
      strategy,
      matches: [],
      blocked: false
    }
  }
  const matches = detectSensitiveData(input.text, strategy)
  if (matches.length === 0) {
    return {
      sanitizedText: input.text,
      mode: input.mode,
      strategy,
      matches: [],
      blocked: false
    }
  }
  const sanitizedText = applyReplacements(input.text, matches)
  return {
    sanitizedText,
    mode: input.mode,
    strategy,
    matches,
    blocked: input.mode === 'strict'
  }
}

export function detectSensitiveData(
  text: string,
  strategy: SensitiveDataSanitizationStrategy
): SensitiveDataMatch[] {
  const allMatches: SensitiveDataMatch[] = []
  for (const detector of DETECTORS) {
    for (const hit of text.matchAll(detector.regex)) {
      const value = hit[0]
      if (typeof value !== 'string' || !value) continue
      const start = hit.index ?? -1
      if (start < 0) continue
      const end = start + value.length
      allMatches.push({
        kind: detector.kind,
        value,
        start,
        end,
        replacement: buildReplacement(detector.kind, value, strategy)
      })
    }
  }
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end)
  const deduped: SensitiveDataMatch[] = []
  let cursor = -1
  for (const item of allMatches) {
    if (item.start < cursor) continue
    deduped.push(item)
    cursor = item.end
  }
  return deduped
}

function buildReplacement(
  kind: SensitiveDataKind,
  value: string,
  strategy: SensitiveDataSanitizationStrategy
): string {
  if (strategy === 'redact') return `[REDACTED_${kind.toUpperCase()}]`
  if (strategy === 'hash') {
    const digest = createHash('sha256').update(value).digest('hex').slice(0, 12)
    return `[HASH_${kind.toUpperCase()}_${digest}]`
  }
  if (value.length <= 4) return '*'.repeat(value.length)
  const prefix = value.slice(0, 2)
  const suffix = value.slice(-2)
  return `${prefix}${'*'.repeat(Math.max(2, value.length - 4))}${suffix}`
}

function applyReplacements(text: string, matches: SensitiveDataMatch[]): string {
  let out = ''
  let cursor = 0
  for (const match of matches) {
    out += text.slice(cursor, match.start)
    out += match.replacement
    cursor = match.end
  }
  out += text.slice(cursor)
  return out
}
