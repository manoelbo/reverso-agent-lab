import { createContext, useMemo, type ReactNode } from 'react'
import { HttpAgentTransport, type AgentTransport } from '@/lib/agent-transport'

export const AgentContext = createContext<AgentTransport | null>(null)

interface AgentProviderProps {
  children: ReactNode
  baseUrl?: string
}

export function AgentProvider({ children, baseUrl }: AgentProviderProps) {
  const transport = useMemo(
    () => new HttpAgentTransport(baseUrl),
    [baseUrl],
  )

  return (
    <AgentContext.Provider value={transport}>
      {children}
    </AgentContext.Provider>
  )
}
