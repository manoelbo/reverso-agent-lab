import type { ToolContext } from '../tools/investigative/context.js'
import {
  createDossierEntity,
  createTimelineEvent,
  linkEntities
} from '../tools/investigative/index.js'
import { processSourceTool } from '../tools/document-processing/process-source-tool.js'

export type ToolName =
  | 'createDossierEntity'
  | 'createTimelineEvent'
  | 'linkEntities'
  | 'processSourceTool'

export type ToolCapability = 'read' | 'extract' | 'crosscheck' | 'persist'
export type ToolRiskLevel = 'low' | 'medium' | 'high'
export type ToolSideEffect = 'read_only' | 'write'

export interface ToolCall<T = unknown> {
  tool: ToolName
  input: T
}

export interface ToolResult {
  tool: ToolName
  ok: boolean
  output?: unknown
  error?: string
  errorCode?: 'input_validation' | 'runtime_exception' | 'permission_denied' | 'unknown'
  meta?: {
    missingFields?: string[]
  }
}

export interface ToolDefinition {
  name: ToolName
  requiredFields: string[]
  capabilities: ToolCapability[]
  sideEffects: ToolSideEffect
  riskLevel: ToolRiskLevel
  estimatedCost: {
    tokens: number
    latencyMs: number
  }
}

type ToolExecutor = (input: any, ctx: ToolContext) => Promise<unknown>

const registry: Record<ToolName, ToolExecutor> = {
  createDossierEntity,
  createTimelineEvent,
  linkEntities,
  processSourceTool
}

const definitions: Record<ToolName, ToolDefinition> = {
  createDossierEntity: {
    name: 'createDossierEntity',
    requiredFields: ['type', 'name', 'summary'],
    capabilities: ['extract', 'persist'],
    sideEffects: 'write',
    riskLevel: 'medium',
    estimatedCost: { tokens: 500, latencyMs: 1200 }
  },
  createTimelineEvent: {
    name: 'createTimelineEvent',
    requiredFields: ['date', 'actors', 'eventType', 'source', 'description'],
    capabilities: ['extract', 'persist'],
    sideEffects: 'write',
    riskLevel: 'medium',
    estimatedCost: { tokens: 550, latencyMs: 1300 }
  },
  linkEntities: {
    name: 'linkEntities',
    requiredFields: ['filePath'],
    capabilities: ['crosscheck', 'persist'],
    sideEffects: 'write',
    riskLevel: 'high',
    estimatedCost: { tokens: 700, latencyMs: 1800 }
  },
  processSourceTool: {
    name: 'processSourceTool',
    requiredFields: ['subcommand'],
    capabilities: ['read', 'extract', 'crosscheck'],
    sideEffects: 'read_only',
    riskLevel: 'low',
    estimatedCost: { tokens: 900, latencyMs: 2200 }
  }
}

export function getToolDefinitions(): ToolDefinition[] {
  return Object.values(definitions)
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return (definitions as Record<string, ToolDefinition | undefined>)[name]
}

export function validateToolCallInput(
  call: ToolCall
): { ok: true } | { ok: false; error: string; missingFields?: string[] } {
  const schema = definitions[call.tool]
  if (!schema) return { ok: false, error: `Tool nao registrada: ${call.tool}` }
  if (typeof call.input !== 'object' || call.input === null || Array.isArray(call.input)) {
    return { ok: false, error: `Input invalido para ${call.tool}: esperado objeto JSON.` }
  }
  const input = call.input as Record<string, unknown>
  const missing = schema.requiredFields.filter((field) => input[field] === undefined || input[field] === null)
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Input incompleto para ${call.tool}. Campos obrigatorios ausentes: ${missing.join(', ')}`,
      missingFields: missing
    }
  }
  return { ok: true }
}

export async function executeToolCall(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  const executor = registry[call.tool]
  const validation = validateToolCallInput(call)
  if (!validation.ok) {
    return {
      tool: call.tool,
      ok: false,
      error: validation.error,
      errorCode: 'input_validation',
      meta: {
        ...(validation.missingFields && validation.missingFields.length > 0
          ? { missingFields: validation.missingFields }
          : {})
      }
    }
  }
  try {
    const output = await executor(call.input, ctx)
    return { tool: call.tool, ok: true, output }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    const errorCode: ToolResult['errorCode'] = lower.includes('denied') || lower.includes('permission')
      ? 'permission_denied'
      : 'runtime_exception'
    return {
      tool: call.tool,
      ok: false,
      error: message,
      errorCode
    }
  }
}

export function validatePlannedToolActions(
  actions: Array<{
    tool: string
    capability: ToolCapability
    riskLevel: ToolRiskLevel
    estimatedCost: { tokens: number; latencyMs: number }
  }>,
  opts?: {
    maxTotalEstimatedTokens?: number
    requireFinalPersist?: boolean
  }
): { ok: true } | { ok: false; error: string } {
  const maxTokens =
    typeof opts?.maxTotalEstimatedTokens === 'number' && Number.isFinite(opts.maxTotalEstimatedTokens)
      ? Math.max(0, Math.floor(opts.maxTotalEstimatedTokens))
      : undefined
  let totalEstimatedTokens = 0
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (!action) continue
    const tool = action.tool as ToolName
    const definition = definitions[tool]
    if (!definition) {
      return { ok: false, error: `Plano invalido: tool nao registrada (${action.tool}).` }
    }
    if (!definition.capabilities.includes(action.capability)) {
      return {
        ok: false,
        error: `Plano invalido: capability ${action.capability} nao permitida para ${action.tool}.`
      }
    }
    if (action.riskLevel !== definition.riskLevel) {
      return {
        ok: false,
        error: `Plano invalido: riskLevel divergente para ${action.tool} (esperado: ${definition.riskLevel}).`
      }
    }
    if (definition.sideEffects === 'write' && action.capability === 'persist' && index !== actions.length - 1) {
      return {
        ok: false,
        error: `Plano invalido: acao persist deve ser a ultima etapa (${action.tool}).`
      }
    }
    totalEstimatedTokens += Math.max(0, Math.floor(action.estimatedCost.tokens))
  }
  if (opts?.requireFinalPersist) {
    const last = actions[actions.length - 1]
    if (actions.length > 0 && last?.capability !== 'persist') {
      return { ok: false, error: 'Plano invalido: etapa final deve usar capability persist.' }
    }
  }
  if (typeof maxTokens === 'number' && totalEstimatedTokens > maxTokens) {
    return {
      ok: false,
      error: `Plano excede orçamento estimado de tokens (${totalEstimatedTokens} > ${maxTokens}).`
    }
  }
  return { ok: true }
}

