import { resolveRuntimeConfig, type RuntimeConfig } from '../config/env.js'
import { loadActiveSession } from '../core/deep-dive-session-store.js'
import type { DeepDiveSessionState } from '../core/deep-dive-session.js'
import { isActionableSession, type LeadSummary } from '../runner/run-agent.js'
import { detectSystemState, type SystemState } from './state-detector.js'

export interface RoutingContext {
  runtime: RuntimeConfig
  session?: DeepDiveSessionState
  hasAgentContext: boolean
  leads: LeadSummary[]
  systemState: SystemState
}

export async function loadRoutingContext(): Promise<RoutingContext> {
  const runtime = await resolveRuntimeConfig()

  // Detect full system state (source files, agent context, session info, leads)
  const systemState = await detectSystemState(runtime)

  // Load full session record separately (needed for the typed session object in RoutingContext)
  const sessionRecord = await loadActiveSession(runtime.paths)

  const ctx: RoutingContext = {
    runtime,
    hasAgentContext: systemState.hasAgentContext,
    leads: systemState.leads,
    systemState,
  }

  if (isActionableSession(sessionRecord)) {
    ctx.session = sessionRecord
  }

  return ctx
}
