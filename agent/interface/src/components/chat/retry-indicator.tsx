import { Shimmer } from "@/components/ai-elements/shimmer"

interface RetryIndicatorProps {
  attempt: number
  maxAttempts: number
  delaySec: number
  errorSnippet: string
  onCancel?: () => void
  onRetryNow?: () => void
}

export function RetryIndicator({
  attempt,
  maxAttempts,
  delaySec,
  errorSnippet,
  onCancel,
  onRetryNow,
}: RetryIndicatorProps) {
  const label = `Tentativa ${attempt}/${maxAttempts} — aguardando ${delaySec}s antes de tentar novamente...`

  return (
    <div className="my-1 flex flex-col gap-2">
      <Shimmer className="text-sm text-muted-foreground">{label}</Shimmer>
      {errorSnippet && (
        <p className="font-mono text-xs text-muted-foreground/60 truncate max-w-sm">
          {errorSnippet}
        </p>
      )}
      {(onRetryNow || onCancel) && (
        <div className="flex gap-2">
          {onRetryNow && (
            <button
              type="button"
              onClick={onRetryNow}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-muted transition-colors"
            >
              Tentar agora
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
