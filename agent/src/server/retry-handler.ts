/**
 * Retry com backoff exponencial para chamadas LLM.
 * Inspirado no SessionRetry do OpenCode e api_req_failed do Cline.
 */

export interface RetryInfo {
  attempt: number
  maxAttempts: number
  delaySec: number
  errorSnippet: string
}

const RETRYABLE_STATUS_CODES = new Set([429, 529])
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /network/i,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /socket hang up/i,
  /overloaded/i,
  /rate.?limit/i,
]

const NON_RETRYABLE_PATTERNS = [
  /context.{0,20}(overflow|length|too.?long|maximum)/i,
  /auth(entication|orization)?.{0,20}(error|fail|invalid)/i,
  /invalid.{0,10}api.?key/i,
  /401/,
]

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)

  // Nunca re-tentar erros críticos
  if (NON_RETRYABLE_PATTERNS.some((p) => p.test(msg))) return false

  // Código de status HTTP embutido na mensagem
  const statusMatch = msg.match(/\b(4\d{2}|5\d{2})\b/)
  if (statusMatch) {
    const code = Number(statusMatch[1])
    return RETRYABLE_STATUS_CODES.has(code)
  }

  return RETRYABLE_ERROR_PATTERNS.some((p) => p.test(msg))
}

function errorSnippet(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.slice(0, 120)
}

function backoffSec(attempt: number): number {
  // 2s → 4s → 8s
  return Math.pow(2, attempt)
}

/**
 * Executa fn com retry automático e backoff exponencial.
 *
 * @param fn Função a executar
 * @param signal AbortSignal para interromper o wait entre tentativas
 * @param onRetry Callback chamado antes de cada retry (emite SSE event)
 * @param maxAttempts Número máximo de tentativas (default: 3)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  signal: AbortSignal,
  onRetry: (info: RetryInfo) => void,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) throw new Error('Aborted')

    try {
      return await fn()
    } catch (err) {
      lastErr = err

      const isLast = attempt === maxAttempts
      if (isLast || !isRetryable(err)) {
        throw err
      }

      const delaySec = backoffSec(attempt)
      onRetry({
        attempt,
        maxAttempts,
        delaySec,
        errorSnippet: errorSnippet(err),
      })

      // Espera com abort signal
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delaySec * 1000)
        if (signal.aborted) {
          clearTimeout(timer)
          reject(new Error('Aborted during retry wait'))
          return
        }
        const onAbort = (): void => {
          clearTimeout(timer)
          reject(new Error('Aborted during retry wait'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      })
    }
  }

  throw lastErr
}
