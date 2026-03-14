export type StopReason =
  | 'goal_reached'
  | 'insufficient_evidence'
  | 'budget_exceeded'
  | 'max_steps_reached'
  | 'low_confidence'
  | 'tool_error'
  | 'compliance_denied'
  | 'timeout'
  | 'no_progress'

export interface LoopBudget {
  maxSteps: number
  maxToolCalls: number
  maxElapsedMs: number
  maxTokens?: number
}

export interface LoopUsage {
  steps: number
  toolCalls: number
  elapsedMs: number
  estimatedTokens: number
}

export interface VerificationResult {
  ok: boolean
  confidence: number
  reason: string
  gaps: string[]
}

export interface PlannedToolAction {
  tool: string
  capability: 'read' | 'extract' | 'crosscheck' | 'persist'
  rationale: string
  expectedOutput: string
  riskLevel: 'low' | 'medium' | 'high'
  estimatedCost: {
    tokens: number
    latencyMs: number
  }
  input: Record<string, unknown>
}

export interface StructuredExecutionPlan {
  objective: string
  hypotheses: string[]
  actions: PlannedToolAction[]
  successCriteria: string[]
  stopCriteria: string[]
  confidenceTarget: number
}

export function createLoopBudget(input?: Partial<LoopBudget>): LoopBudget {
  const maxSteps = Math.max(1, Math.floor(input?.maxSteps ?? 6))
  const maxToolCalls = Math.max(1, Math.floor(input?.maxToolCalls ?? 12))
  const maxElapsedMs = Math.max(1_000, Math.floor(input?.maxElapsedMs ?? 120_000))
  const maxTokens =
    typeof input?.maxTokens === 'number' && Number.isFinite(input.maxTokens)
      ? Math.max(100, Math.floor(input.maxTokens))
      : undefined

  return {
    maxSteps,
    maxToolCalls,
    maxElapsedMs,
    ...(maxTokens !== undefined ? { maxTokens } : {})
  }
}

export function estimateTokensFromText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return Math.max(1, Math.ceil(trimmed.length / 4))
}

export function clampConfidence(value: number | undefined, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}
