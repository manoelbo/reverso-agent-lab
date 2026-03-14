import { stripCodeFence } from '../core/markdown.js'

interface ChatRequest {
  model: string
  system: string
  user: string
  temperature?: number
  timeoutMs?: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
}

export interface ChatStreamRequest extends ChatRequest {
  /** Called for each streamed delta; return value is ignored. */
  onChunk?: (delta: string) => void
  /** Called once at the end of the stream with real token counts from the API. */
  onUsage?: (usage: TokenUsage) => void
  /** Prior conversation turns to include between system and user messages. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

interface OpenRouterChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>
  }
}

type MessageContent = string | Array<{ type?: string; text?: string }> | undefined

function parseContent(content: MessageContent): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('\n')
      .trim()
  }
  return ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class OpenRouterClient {
  constructor(private readonly apiKey: string) {}

  async chatText(request: ChatRequest): Promise<string> {
    return this.chatTextStream({ ...request })
  }

  /**
   * Streams the model response; optionally call onChunk for each delta.
   * Returns the full concatenated content.
   */
  async chatTextStream(request: ChatStreamRequest): Promise<string> {
    const onChunk = request.onChunk
    const onUsage = request.onUsage
    let lastError: Error | undefined
    const timeoutMs = request.timeoutMs ?? 120_000

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://reverso.local/lab/agent',
            'X-Title': 'Reverso Agent Lab'
          },
          body: JSON.stringify({
            model: request.model,
            temperature: request.temperature ?? 0.2,
            stream: true,
            stream_options: { include_usage: true },
            messages: [
              { role: 'system', content: request.system },
              ...(request.history ?? []),
              { role: 'user', content: request.user },
            ],
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          const rawBody = await response.text()
          const json = rawBody ? JSON.parse(rawBody) : {}
          const message = json?.error?.message ?? `HTTP ${response.status}`
          throw new Error(`Falha OpenRouter: ${message}`)
        }

        const reader = response.body?.getReader()
        if (!reader) throw new Error('Response body is not readable')

        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          while (true) {
            const lineEnd = buffer.indexOf('\n')
            if (lineEnd === -1) break
            const line = buffer.slice(0, lineEnd).trim()
            buffer = buffer.slice(lineEnd + 1)
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data) as {
                error?: { message?: string }
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>
                usage?: {
                  prompt_tokens?: number
                  completion_tokens?: number
                  total_tokens?: number
                  prompt_tokens_details?: { cached_tokens?: number }
                }
              }
              if (parsed.error) {
                throw new Error(parsed.error.message ?? 'Stream error')
              }
              const content = parsed.choices?.[0]?.delta?.content
              if (typeof content === 'string') {
                fullContent += content
                onChunk?.(content)
              }
              if (parsed.usage && onUsage) {
                const inputTokens = parsed.usage.prompt_tokens ?? 0
                const outputTokens = parsed.usage.completion_tokens ?? 0
                const totalTokens = parsed.usage.total_tokens ?? inputTokens + outputTokens
                const cachedRaw = parsed.usage.prompt_tokens_details?.cached_tokens
                const usage: TokenUsage =
                  cachedRaw !== undefined
                    ? { inputTokens, outputTokens, totalTokens, cachedInputTokens: cachedRaw }
                    : { inputTokens, outputTokens, totalTokens }
                onUsage(usage)
              }
            } catch (e) {
              if (e instanceof Error && e.message === 'Stream error') throw e
              // ignore invalid JSON / comments
            }
          }
        }
        clearTimeout(timeout)
        return stripCodeFence(fullContent.trim())
      } catch (error) {
        lastError =
          error instanceof Error
            ? error.name === 'AbortError'
              ? new Error('Timeout ao chamar OpenRouter.')
              : error
            : new Error(String(error))
        if (attempt < 3) {
          await sleep(700 * attempt)
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError ?? new Error('Falha desconhecida no OpenRouter.')
  }

  async chatJson<T>(request: ChatRequest, fallback: T): Promise<T> {
    const content = await this.chatText(request)
    try {
      return JSON.parse(stripCodeFence(content)) as T
    } catch {
      return fallback
    }
  }
}

