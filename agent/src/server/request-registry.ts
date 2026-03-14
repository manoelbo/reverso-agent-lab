/**
 * Registry de requests ativos com AbortController por request.
 * Permite cancelar operações em andamento via POST /api/cancel.
 */

const registry = new Map<string, AbortController>()
let mostRecentId: string | null = null

/**
 * Registra um novo request e retorna seu AbortController.
 * O request mais recente é rastreado para suporte ao verbal abort ("para").
 */
export function registerRequest(requestId: string): AbortController {
  const controller = new AbortController()
  registry.set(requestId, controller)
  mostRecentId = requestId
  return controller
}

/**
 * Cancela um request específico pelo ID.
 * Retorna true se encontrado e cancelado, false se não encontrado.
 */
export function cancelRequest(requestId: string): boolean {
  const controller = registry.get(requestId)
  if (!controller) return false
  controller.abort()
  return true
}

/**
 * Cancela o request mais recente, exceto o fornecido.
 * Usado quando o usuário diz "para" — o request atual é o "para", não o que queremos cancelar.
 * Retorna o ID do request cancelado, ou null se nenhum foi cancelado.
 */
export function cancelMostRecentOtherThan(requestId: string): string | null {
  if (!mostRecentId || mostRecentId === requestId) {
    // Tentar cancelar qualquer outro request ativo
    for (const [id, controller] of registry) {
      if (id !== requestId) {
        controller.abort()
        return id
      }
    }
    return null
  }
  const cancelled = mostRecentId
  const controller = registry.get(cancelled)
  if (controller) {
    controller.abort()
  }
  return cancelled
}

/**
 * Verifica se um request foi abortado.
 */
export function isAborted(requestId: string): boolean {
  const controller = registry.get(requestId)
  return controller?.signal.aborted ?? false
}

/**
 * Remove um request do registry (chamado ao finalizar o stream).
 */
export function unregisterRequest(requestId: string): void {
  registry.delete(requestId)
  if (mostRecentId === requestId) {
    mostRecentId = null
  }
}
