import type { AgentEvent } from './types'

/**
 * Parses a fetch Response with Content-Type: text/event-stream into an
 * AsyncIterable<AgentEvent>. Using fetch instead of EventSource because the
 * endpoint is POST — EventSource only supports GET.
 */
export async function* parseSseResponse(
  response: Response,
): AsyncIterable<AgentEvent> {
  if (!response.ok) {
    throw new Error(`Server error: ${response.status} ${response.statusText}`)
  }

  const body = response.body
  if (!body) {
    throw new Error('Response body is empty')
  }

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete lines (split on \n)
      const lines = buffer.split('\n')
      // Keep the last potentially incomplete line in buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice('event: '.length).trim()
        } else if (line.startsWith('data: ')) {
          const raw = line.slice('data: '.length).trim()
          if (raw) {
            try {
              const data = JSON.parse(raw) as Record<string, unknown>
              if (currentEvent) {
                yield { type: currentEvent, data }
              }
            } catch {
              // Malformed JSON — skip silently
            }
            currentEvent = ''
          }
        } else if (line === '') {
          // Empty line = end of event block; reset event name
          currentEvent = ''
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
