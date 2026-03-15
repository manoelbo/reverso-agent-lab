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
