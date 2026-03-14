import type { JSX } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { AgentSessionContext } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  initial: 'inicial',
  deep_dive: 'deep-dive',
  deep_dive_active: 'deep-dive',
  lead_created: 'lead criado',
  inquiry: 'inquiry',
}

function stageBadgeLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

function shortModelName(model: string): string {
  // "anthropic/claude-3.5-sonnet" → "claude-3.5-sonnet"
  const parts = model.split('/')
  return parts[parts.length - 1] ?? model
}

interface ChatHeaderProps {
  sessionContext: AgentSessionContext | null
  connected: boolean
  autoApprove: boolean
  onAutoApproveChange: (value: boolean) => void
}

export function ChatHeader({
  sessionContext,
  connected,
  autoApprove,
  onAutoApproveChange,
}: ChatHeaderProps): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
      {/* Left: app name + session stage */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-foreground">Reverso Agent</span>
        {sessionContext?.sessionStage && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {stageBadgeLabel(sessionContext.sessionStage)}
          </span>
        )}
      </div>

      {/* Center: model name */}
      {sessionContext?.model && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
          {shortModelName(sessionContext.model)}
        </span>
      )}

      {/* Right: leads count + connection dot + auto-approve */}
      <div className="flex items-center gap-3">
        {sessionContext !== null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {sessionContext.leadsCount} lead{sessionContext.leadsCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Connection indicator */}
        <span
          className={cn(
            'size-1.5 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500',
          )}
          title={connected ? 'Servidor conectado' : 'Servidor desconectado'}
        />

        {/* Auto-approve toggle */}
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor="auto-approve"
            className="text-[10px] text-muted-foreground cursor-pointer"
          >
            Auto-approve
          </Label>
          <Switch
            id="auto-approve"
            checked={autoApprove}
            onCheckedChange={onAutoApproveChange}
            className="scale-75 origin-right"
          />
        </div>
      </div>
    </div>
  )
}
