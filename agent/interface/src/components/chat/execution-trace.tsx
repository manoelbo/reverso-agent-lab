import { ActivityIcon, ChevronDownIcon } from "lucide-react"
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought"
import type { TraceStep } from "@/lib/types"

function formatDuration(step: TraceStep): string | undefined {
  if (!step.endedAt) return undefined
  const ms = step.endedAt - step.startedAt
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function mapStatus(step: TraceStep): "complete" | "active" | "error" {
  return step.status
}

export interface ExecutionTraceProps {
  steps: TraceStep[]
  isStreaming?: boolean
}

export function ExecutionTrace({ steps, isStreaming = false }: ExecutionTraceProps) {
  if (steps.length === 0) return null

  const activeCount = steps.filter((s) => s.status === "active").length
  const headerLabel =
    isStreaming && activeCount > 0
      ? `Executando…`
      : `Trace · ${steps.length} ${steps.length === 1 ? "passo" : "passos"}`

  return (
    <ChainOfThought defaultOpen={isStreaming}>
      <ChainOfThoughtHeader>
        <ActivityIcon className="size-3.5" />
        <span>{headerLabel}</span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step) => {
          const duration = formatDuration(step)
          const description = step.description
            ? duration
              ? `${step.description} · ${duration}`
              : step.description
            : duration

          return (
            <ChainOfThoughtStep
              key={step.id}
              label={step.label}
              description={description}
              status={mapStatus(step)}
            />
          )
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
