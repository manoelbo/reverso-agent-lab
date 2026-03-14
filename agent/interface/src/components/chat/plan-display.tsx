import {
  Plan,
  PlanContent,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "@/components/ai-elements/plan"
import {
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
} from "@/components/ai-elements/queue"
import type { MessagePartType, PlanStep } from "@/lib/types"
import { ListTodoIcon } from "lucide-react"

type PlanPart = Extract<MessagePartType, { type: "plan" }>

function stepIndicatorClass(status: PlanStep["status"]): string {
  if (status === "running") return "animate-pulse border-blue-500 bg-blue-500/20"
  if (status === "error") return "border-red-500 bg-red-500/20"
  return ""
}

export function PlanDisplay({
  part,
  isStreaming,
}: {
  part: PlanPart
  isStreaming?: boolean
}) {
  return (
    <Plan defaultOpen isStreaming={isStreaming}>
      <PlanHeader className="p-3">
        <div className="flex items-center gap-2">
          <ListTodoIcon className="size-4 text-muted-foreground" />
          <PlanTitle>{part.title}</PlanTitle>
        </div>
        <PlanTrigger />
      </PlanHeader>
      <PlanContent className="px-3 pb-3 pt-0">
        <ul className="flex flex-col">
          {part.steps.map((step) => (
            <QueueItem key={step.id}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator
                  completed={step.status === "done"}
                  className={stepIndicatorClass(step.status)}
                />
                <QueueItemContent completed={step.status === "done"}>
                  {step.title}
                </QueueItemContent>
              </div>
            </QueueItem>
          ))}
        </ul>
      </PlanContent>
    </Plan>
  )
}
