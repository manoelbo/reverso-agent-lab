import type {
  ToolCall,
  ToolCapability,
  ToolDefinition,
  ToolRiskLevel,
  ToolResult
} from './tool-registry.js'

export type ComplianceDecision = 'allow' | 'warn' | 'deny'

export interface ComplianceRuleSet {
  defaultDecision: ComplianceDecision
  byRisk?: Partial<Record<ToolRiskLevel, ComplianceDecision>>
  byCapability?: Partial<Record<ToolCapability, ComplianceDecision>>
  byTool?: Partial<Record<string, ComplianceDecision>>
}

export interface ToolComplianceContext {
  step: number
  action: ToolCall
  inputHash: string
  inputSummary: string
  definition?: ToolDefinition
}

export interface ComplianceDecisionResult {
  decision: ComplianceDecision
  reason: string
  source: 'tool' | 'capability' | 'risk' | 'default'
}

export interface PreToolUseInput extends ToolComplianceContext {}

export interface PostToolUseInput extends ToolComplianceContext {
  result: ToolResult
}

export interface ComplianceHooks {
  preToolUse?: (input: PreToolUseInput) => ComplianceDecisionResult | Promise<ComplianceDecisionResult>
  postToolUse?: (input: PostToolUseInput) => ComplianceDecisionResult | Promise<ComplianceDecisionResult>
}

export interface ComplianceAuditEntry {
  phase: 'pre' | 'post'
  step: number
  tool: string
  decision: ComplianceDecision
  reason: string
  source: ComplianceDecisionResult['source']
  inputHash: string
}

export function resolveComplianceDecision(
  context: ToolComplianceContext,
  rules: ComplianceRuleSet
): ComplianceDecisionResult {
  const byTool = rules.byTool?.[context.action.tool]
  if (byTool) {
    return {
      decision: byTool,
      reason: `tool_policy:${context.action.tool}`,
      source: 'tool'
    }
  }

  const capabilities = context.definition?.capabilities ?? []
  for (const capability of capabilities) {
    const byCapability = rules.byCapability?.[capability]
    if (byCapability) {
      return {
        decision: byCapability,
        reason: `capability_policy:${capability}`,
        source: 'capability'
      }
    }
  }

  const risk = context.definition?.riskLevel
  if (risk) {
    const byRisk = rules.byRisk?.[risk]
    if (byRisk) {
      return {
        decision: byRisk,
        reason: `risk_policy:${risk}`,
        source: 'risk'
      }
    }
  }

  return {
    decision: rules.defaultDecision,
    reason: 'default_policy',
    source: 'default'
  }
}

export function createPolicyComplianceHooks(rules: ComplianceRuleSet): ComplianceHooks {
  return {
    preToolUse: (input) => resolveComplianceDecision(input, rules),
    postToolUse: (input) => resolveComplianceDecision(input, rules)
  }
}
