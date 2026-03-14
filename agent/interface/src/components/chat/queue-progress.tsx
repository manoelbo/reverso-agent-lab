import { Button } from "@/components/ui/button"
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
} from "@/components/ai-elements/queue"
import { cn } from "@/lib/utils"
import type { QueueStep } from "@/lib/types"
import { Loader2Icon, CheckIcon, XIcon, BanIcon } from "lucide-react"

interface QueueProgressProps {
  queueId: string
  steps: QueueStep[]
  currentStep: number
  aborted?: boolean
  onCancel?: () => void
}

function StepIcon({ status }: { status: QueueStep["status"] }) {
  if (status === "running") {
    return <Loader2Icon className="size-3 animate-spin text-foreground" />
  }
  if (status === "done") {
    return <CheckIcon className="size-3 text-green-500" />
  }
  if (status === "error") {
    return <XIcon className="size-3 text-destructive" />
  }
  if (status === "aborted") {
    return <BanIcon className="size-3 text-muted-foreground/50" />
  }
  // pending
  return <QueueItemIndicator completed={false} />
}

export function QueueProgress({
  steps,
  aborted,
  onCancel,
}: QueueProgressProps) {
  const hasRunning = steps.some((s) => s.status === "running")
  const allDone = steps.every((s) => s.status === "done")

  return (
    <Queue className="my-1 max-w-sm">
      <div className="flex items-center justify-between pb-1">
        <span className="text-muted-foreground text-xs font-medium">
          {aborted
            ? "Operação cancelada"
            : allDone
              ? "Concluído"
              : "Executando..."}
        </span>
        {hasRunning && !aborted && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-xs text-muted-foreground hover:text-destructive"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        )}
      </div>

      <ul className="space-y-0.5">
        {steps.map((step) => (
          <QueueItem key={step.id}>
            <div className="flex items-center gap-2">
              <StepIcon status={step.status} />
              <QueueItemContent
                completed={step.status === "done" || step.status === "aborted"}
                className={cn(
                  step.status === "running" && "text-foreground font-medium",
                  step.status === "error" && "text-destructive",
                )}
              >
                {step.label}
              </QueueItemContent>
            </div>
          </QueueItem>
        ))}
      </ul>
    </Queue>
  )
}
