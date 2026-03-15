'use client'

import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import type { ToolUIPart } from 'ai'

interface ToolCallDisplayProps {
  toolName: string
  state: ToolUIPart['state']
  input: unknown
  output?: unknown
  errorText?: string
}

export function ToolCallDisplay({
  toolName,
  state,
  input,
  output,
  errorText,
}: ToolCallDisplayProps) {
  return (
    <Tool>
      <ToolHeader
        type={`tool-${toolName}` as ToolUIPart['type']}
        state={state}
        title={toolName}
      />
      <ToolContent>
        <ToolInput input={input} />
        {(output !== undefined || errorText) ? (
          <ToolOutput output={output} errorText={errorText} />
        ) : null}
      </ToolContent>
    </Tool>
  )
}
