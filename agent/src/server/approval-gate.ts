const pending = new Map<string, (approved: boolean) => void>()

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export function waitForApproval(requestId: string): Promise<boolean> {
  return new Promise((resolve) => {
    pending.set(requestId, resolve)
    setTimeout(() => {
      if (pending.delete(requestId)) {
        resolve(false)
      }
    }, APPROVAL_TIMEOUT_MS)
  })
}

export function resolveApproval(requestId: string, approved: boolean): boolean {
  const resolver = pending.get(requestId)
  if (!resolver) return false
  pending.delete(requestId)
  resolver(approved)
  return true
}
