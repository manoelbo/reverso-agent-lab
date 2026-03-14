import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool"
import type { MessagePartType, ToolLifecycle } from "@/lib/types"

const LIFECYCLE_TO_STATE: Record<ToolLifecycle, ToolPart["state"]> = {
  requested: "input-streaming",
  running: "input-available",
  success: "output-available",
  error: "output-error",
  rejected: "output-denied",
}

type ToolCallPart = Extract<MessagePartType, { type: "tool-call" }>

export function ToolCallDisplay({ part }: { part: ToolCallPart }) {
  const state = LIFECYCLE_TO_STATE[part.lifecycle]
  const showOutput = part.lifecycle === "success" || part.lifecycle === "error"

  return (
    <Tool defaultOpen={part.lifecycle !== "success"}>
      <ToolHeader
        type={`tool-${part.toolName}` as `tool-${string}`}
        state={state}
        title={part.toolName}
      />
      <ToolContent className="space-y-3 p-3 [&_pre]:p-2 [&_pre]:text-xs">
        <ToolInput input={part.input} />
        {showOutput && (
          <ToolOutput
            output={part.output}
            errorText={part.error}
          />
        )}
      </ToolContent>
    </Tool>
  )
}
