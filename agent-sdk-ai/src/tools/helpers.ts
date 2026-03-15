export interface ToolRuntimeContext {
  autoAccept?: boolean
}

export function parseToolContext(context: unknown): ToolRuntimeContext {
  if (!context || typeof context !== 'object') return {}
  const value = context as Record<string, unknown>
  return {
    autoAccept: typeof value['autoAccept'] === 'boolean' ? value['autoAccept'] : undefined,
  }
}

export function requiresApproval(context: unknown): boolean {
  const parsed = parseToolContext(context)
  return parsed.autoAccept !== true
}

export function compactOutput(text: string, maxChars = 1800): string {
  const normalized = text.trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars)}\n...[truncado]`
}
