import { useContext, useState } from 'react'
import { useAgentChatStore } from '@/stores/agent-chat-store'
import { AgentContext } from '@/providers/agent-provider'
import { cn } from '@/lib/utils'

type ResetMode = 'chat' | 'investigation' | 'sources-artefacts' | 'all'

interface ResetOption {
  mode: ResetMode
  label: string
  description: string
  color: string
}

const RESET_OPTIONS: ResetOption[] = [
  {
    mode: 'chat',
    label: 'Chat',
    description: 'Limpa histórico de conversa, mantém leads e arquivos',
    color: 'hover:bg-blue-500/15 hover:text-blue-400 hover:border-blue-500/30',
  },
  {
    mode: 'investigation',
    label: 'Investigation',
    description: 'Remove leads, allegations e findings; mantém sources',
    color: 'hover:bg-yellow-500/15 hover:text-yellow-400 hover:border-yellow-500/30',
  },
  {
    mode: 'sources-artefacts',
    label: 'Sources+Artifacts',
    description: 'Remove artefatos gerados; mantém apenas PDFs',
    color: 'hover:bg-orange-500/15 hover:text-orange-400 hover:border-orange-500/30',
  },
  {
    mode: 'all',
    label: 'All',
    description: 'Limpa tudo — filesystem_test vazio',
    color: 'hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30',
  },
]

export function TestModeBar() {
  const [loading, setLoading] = useState<ResetMode | null>(null)
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null)
  const { clearForTest, setSessionContext } = useAgentChatStore()
  const transport = useContext(AgentContext)
  if (!transport) return null

  const handleReset = async (mode: ResetMode) => {
    setLoading(mode)
    setLastResult(null)
    try {
      const result = await transport.resetTest(mode)
      setLastResult(result)
      if (result.ok) {
        clearForTest()
        // Refresh context after reset
        const ctx = await transport.getAgentContext()
        setSessionContext(ctx)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setLastResult({ ok: false, message })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-2 border-b border-yellow-500/20 bg-yellow-500/5 px-3 py-1.5 text-xs">
      <span className="flex items-center gap-1.5 font-mono font-semibold text-yellow-500/80 shrink-0">
        <span className="inline-block size-1.5 rounded-full bg-yellow-500 animate-pulse" />
        TEST MODE
      </span>

      <span className="text-muted-foreground/40 shrink-0">·</span>

      <span className="text-muted-foreground/60 shrink-0">Reset:</span>

      <div className="flex items-center gap-1">
        {RESET_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            onClick={() => void handleReset(opt.mode)}
            disabled={loading !== null}
            title={opt.description}
            className={cn(
              'rounded border border-border/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/70',
              'transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
              opt.color,
              loading === opt.mode && 'opacity-60 cursor-wait',
            )}
          >
            {loading === opt.mode ? '…' : opt.label}
          </button>
        ))}
      </div>

      {lastResult && (
        <span
          className={cn(
            'ml-1 truncate text-[10px]',
            lastResult.ok ? 'text-green-400/70' : 'text-red-400/70',
          )}
        >
          {lastResult.ok ? '✓' : '✗'} {lastResult.message}
        </span>
      )}
    </div>
  )
}
