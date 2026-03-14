import path from 'node:path'
import dotenv from 'dotenv'
import { resolveLabPaths, type LabPaths } from '../core/paths.js'
import {
  parseArtifactLanguage,
  parseResponseLanguage,
  type ArtifactLanguage,
  type ResponseLanguage
} from '../core/language.js'
import type { GovernanceValidationMode } from '../core/editorial-governance.js'
import type { EvidenceVerificationMode } from '../core/evidence-semantic-verifier.js'
import type { SensitiveDataPolicyMode } from '../core/sensitive-data-policy.js'

export interface RuntimeConfig {
  paths: LabPaths
  apiKey: string
  model: string
  responseLanguage: ResponseLanguage
  artifactLanguage: ArtifactLanguage
  enablePev: boolean
  loopMaxSteps: number
  loopMaxToolCalls: number
  loopMaxElapsedMs: number
  confidenceThreshold: number
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  evidenceGateEnabled: boolean
  evidenceMinConfidence: number
  enrichedToolManifestEnabled: boolean
  strictPlanningValidation: boolean
  preWriteValidationEnabled: boolean
  preWriteValidationStrict: boolean
  criticalWriteGateEnabled: boolean
  requireExplicitWriteApproval: boolean
  p1ComplianceHooksEnabled: boolean
  p1DomainSubagentsEnabled: boolean
  p1CheckpointEnabled: boolean
  p1CheckpointRestore: boolean
  editorialGovernanceMode: GovernanceValidationMode
  p2InquiryBatchConcurrency: number
  p2EvidenceVerificationMode: EvidenceVerificationMode
  p2ObservabilityEnabled: boolean
  p2SensitiveDataPolicyMode: SensitiveDataPolicyMode
  defaultResponseLanguage: 'en'
  defaultArtifactLanguage: 'source'
}

export async function resolveRuntimeConfig(opts?: {
  model?: string
  responseLanguage?: string
  artifactLanguage?: string
  enablePev?: boolean
  maxSteps?: number
  maxToolCalls?: number
  maxElapsedMs?: number
  confidenceThreshold?: number
  selfRepairEnabled?: boolean
  selfRepairMaxRounds?: number
  evidenceGateEnabled?: boolean
  evidenceMinConfidence?: number
  enrichedToolManifestEnabled?: boolean
  strictPlanningValidation?: boolean
  preWriteValidationEnabled?: boolean
  preWriteValidationStrict?: boolean
  criticalWriteGateEnabled?: boolean
  requireExplicitWriteApproval?: boolean
  p1ComplianceHooksEnabled?: boolean
  p1DomainSubagentsEnabled?: boolean
  p1CheckpointEnabled?: boolean
  p1CheckpointRestore?: boolean
  editorialGovernanceEnabled?: boolean
  editorialGovernanceStrict?: boolean
  p2InquiryBatchConcurrency?: number
  p2EvidenceVerificationMode?: EvidenceVerificationMode
  p2ObservabilityEnabled?: boolean
  p2SensitiveDataPolicyMode?: SensitiveDataPolicyMode
}): Promise<RuntimeConfig> {
  const paths = await resolveLabPaths(process.cwd())
  dotenv.config({ path: path.join(paths.projectRoot, '.env.local') })
  dotenv.config({ path: path.join(paths.projectRoot, '.env') })

  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY nao encontrado em .env.local/.env.')
  }

  const model = opts?.model ?? process.env.AGENT_LAB_MODEL ?? 'google/gemini-2.5-flash'
  const responseLanguage =
    parseResponseLanguage(opts?.responseLanguage) ??
    parseResponseLanguage(process.env.AGENT_LAB_RESPONSE_LANGUAGE_OVERRIDE) ??
    'auto'
  const artifactLanguage =
    parseArtifactLanguage(opts?.artifactLanguage) ??
    parseArtifactLanguage(process.env.AGENT_LAB_ARTIFACT_LANGUAGE_OVERRIDE) ??
    'source'
  const envPev =
    process.env.AGENT_LAB_PEV_ENABLED === '1' ||
    String(process.env.AGENT_LAB_PEV_ENABLED).toLowerCase() === 'true'
  const enablePev = typeof opts?.enablePev === 'boolean' ? opts.enablePev : envPev
  const loopMaxSteps = resolvePositiveInt(opts?.maxSteps, process.env.AGENT_LAB_LOOP_MAX_STEPS, 6)
  const loopMaxToolCalls = resolvePositiveInt(
    opts?.maxToolCalls,
    process.env.AGENT_LAB_LOOP_MAX_TOOL_CALLS,
    12
  )
  const loopMaxElapsedMs = resolvePositiveInt(
    opts?.maxElapsedMs,
    process.env.AGENT_LAB_LOOP_MAX_ELAPSED_MS,
    120_000
  )
  const confidenceThreshold = resolveThreshold(
    opts?.confidenceThreshold,
    process.env.AGENT_LAB_CONFIDENCE_THRESHOLD,
    0.75
  )
  const envSelfRepair =
    process.env.AGENT_LAB_SELF_REPAIR_ENABLED === '1' ||
    String(process.env.AGENT_LAB_SELF_REPAIR_ENABLED).toLowerCase() === 'true'
  const selfRepairEnabled =
    typeof opts?.selfRepairEnabled === 'boolean' ? opts.selfRepairEnabled : envSelfRepair
  const selfRepairMaxRounds = resolvePositiveInt(
    opts?.selfRepairMaxRounds,
    process.env.AGENT_LAB_SELF_REPAIR_MAX_ROUNDS,
    1
  )
  const envEvidenceGate =
    process.env.AGENT_LAB_EVIDENCE_GATE_ENABLED === '1' ||
    String(process.env.AGENT_LAB_EVIDENCE_GATE_ENABLED).toLowerCase() === 'true'
  const evidenceGateEnabled =
    typeof opts?.evidenceGateEnabled === 'boolean' ? opts.evidenceGateEnabled : envEvidenceGate
  const evidenceMinConfidence = resolveThreshold(
    opts?.evidenceMinConfidence,
    process.env.AGENT_LAB_EVIDENCE_MIN_CONFIDENCE,
    0.75
  )
  const envEnrichedToolManifest =
    process.env.AGENT_LAB_ENRICHED_TOOL_MANIFEST_ENABLED === '1' ||
    String(process.env.AGENT_LAB_ENRICHED_TOOL_MANIFEST_ENABLED).toLowerCase() === 'true'
  const enrichedToolManifestEnabled =
    typeof opts?.enrichedToolManifestEnabled === 'boolean'
      ? opts.enrichedToolManifestEnabled
      : envEnrichedToolManifest
  const envStrictPlanningValidation =
    process.env.AGENT_LAB_STRICT_PLANNING_VALIDATION === '1' ||
    String(process.env.AGENT_LAB_STRICT_PLANNING_VALIDATION).toLowerCase() === 'true'
  const strictPlanningValidation =
    typeof opts?.strictPlanningValidation === 'boolean'
      ? opts.strictPlanningValidation
      : envStrictPlanningValidation
  const envPreWriteValidation =
    process.env.AGENT_LAB_PREWRITE_VALIDATION_ENABLED === '1' ||
    String(process.env.AGENT_LAB_PREWRITE_VALIDATION_ENABLED).toLowerCase() === 'true'
  const preWriteValidationEnabled =
    typeof opts?.preWriteValidationEnabled === 'boolean'
      ? opts.preWriteValidationEnabled
      : envPreWriteValidation
  const envPreWriteValidationStrict =
    process.env.AGENT_LAB_PREWRITE_VALIDATION_STRICT === '1' ||
    String(process.env.AGENT_LAB_PREWRITE_VALIDATION_STRICT).toLowerCase() === 'true'
  const preWriteValidationStrict =
    typeof opts?.preWriteValidationStrict === 'boolean'
      ? opts.preWriteValidationStrict
      : envPreWriteValidationStrict
  const criticalWriteGateEnabled = resolveBooleanFlag(
    opts?.criticalWriteGateEnabled,
    process.env.AGENT_LAB_CRITICAL_WRITE_GATE_ENABLED,
    true
  )
  const requireExplicitWriteApproval = resolveBooleanFlag(
    opts?.requireExplicitWriteApproval,
    process.env.AGENT_LAB_REQUIRE_EXPLICIT_WRITE_APPROVAL,
    true
  )
  const p1ComplianceHooksEnabled = resolveBooleanFlag(
    opts?.p1ComplianceHooksEnabled,
    process.env.AGENT_LAB_P1_COMPLIANCE_HOOKS_ENABLED,
    false
  )
  const p1DomainSubagentsEnabled = resolveBooleanFlag(
    opts?.p1DomainSubagentsEnabled,
    process.env.AGENT_LAB_P1_DOMAIN_SUBAGENTS_ENABLED,
    false
  )
  const p1CheckpointEnabled = resolveBooleanFlag(
    opts?.p1CheckpointEnabled,
    process.env.AGENT_LAB_P1_CHECKPOINT_ENABLED,
    false
  )
  const p1CheckpointRestore = resolveBooleanFlag(
    opts?.p1CheckpointRestore,
    process.env.AGENT_LAB_P1_CHECKPOINT_RESTORE,
    false
  )
  const editorialGovernanceEnabled = resolveBooleanFlag(
    opts?.editorialGovernanceEnabled,
    process.env.AGENT_LAB_EDITORIAL_GOVERNANCE_ENABLED,
    false
  )
  const editorialGovernanceStrict = resolveBooleanFlag(
    opts?.editorialGovernanceStrict,
    process.env.AGENT_LAB_EDITORIAL_GOVERNANCE_STRICT,
    false
  )
  const editorialGovernanceMode: GovernanceValidationMode = editorialGovernanceEnabled
    ? editorialGovernanceStrict
      ? 'strict'
      : 'soft'
    : 'off'
  const p2InquiryBatchConcurrency = resolvePositiveInt(
    opts?.p2InquiryBatchConcurrency,
    process.env.AGENT_LAB_P2_INQUIRY_BATCH_CONCURRENCY,
    1
  )
  const p2EvidenceVerificationMode = resolveEvidenceMode(
    opts?.p2EvidenceVerificationMode,
    process.env.AGENT_LAB_P2_EVIDENCE_VERIFICATION_MODE
  )
  const p2ObservabilityEnabled = resolveBooleanFlag(
    opts?.p2ObservabilityEnabled,
    process.env.AGENT_LAB_P2_OBSERVABILITY_ENABLED,
    true
  )
  const p2SensitiveDataPolicyMode = resolveSensitiveMode(
    opts?.p2SensitiveDataPolicyMode,
    process.env.AGENT_LAB_P2_SENSITIVE_DATA_POLICY_MODE
  )

  return {
    paths,
    apiKey,
    model,
    responseLanguage,
    artifactLanguage,
    enablePev,
    loopMaxSteps,
    loopMaxToolCalls,
    loopMaxElapsedMs,
    confidenceThreshold,
    selfRepairEnabled,
    selfRepairMaxRounds,
    evidenceGateEnabled,
    evidenceMinConfidence,
    enrichedToolManifestEnabled,
    strictPlanningValidation,
    preWriteValidationEnabled,
    preWriteValidationStrict,
    criticalWriteGateEnabled,
    requireExplicitWriteApproval,
    p1ComplianceHooksEnabled,
    p1DomainSubagentsEnabled,
    p1CheckpointEnabled,
    p1CheckpointRestore,
    editorialGovernanceMode,
    p2InquiryBatchConcurrency,
    p2EvidenceVerificationMode,
    p2ObservabilityEnabled,
    p2SensitiveDataPolicyMode,
    defaultResponseLanguage: 'en',
    defaultArtifactLanguage: 'source'
  }
}

function resolveEvidenceMode(
  direct: EvidenceVerificationMode | undefined,
  envValue: string | undefined
): EvidenceVerificationMode {
  if (direct === 'lexical' || direct === 'semantic' || direct === 'hybrid') return direct
  const normalized = envValue?.trim().toLowerCase()
  if (normalized === 'semantic' || normalized === 'hybrid' || normalized === 'lexical') {
    return normalized
  }
  return 'lexical'
}

function resolveSensitiveMode(
  direct: SensitiveDataPolicyMode | undefined,
  envValue: string | undefined
): SensitiveDataPolicyMode {
  if (direct === 'off' || direct === 'warn' || direct === 'strict') return direct
  const normalized = envValue?.trim().toLowerCase()
  if (normalized === 'off' || normalized === 'warn' || normalized === 'strict') {
    return normalized
  }
  return 'warn'
}

function resolvePositiveInt(
  direct: number | undefined,
  envValue: string | undefined,
  fallback: number
): number {
  if (typeof direct === 'number' && Number.isFinite(direct)) return Math.max(1, Math.floor(direct))
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    const parsed = Number.parseInt(envValue, 10)
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed))
  }
  return fallback
}

function resolveThreshold(
  direct: number | undefined,
  envValue: string | undefined,
  fallback: number
): number {
  if (typeof direct === 'number' && Number.isFinite(direct)) return Math.min(1, Math.max(0, direct))
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    const parsed = Number.parseFloat(envValue)
    if (Number.isFinite(parsed)) return Math.min(1, Math.max(0, parsed))
  }
  return fallback
}

function resolveBooleanFlag(
  direct: boolean | undefined,
  envValue: string | undefined,
  fallback: boolean
): boolean {
  if (typeof direct === 'boolean') return direct
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    const normalized = envValue.trim().toLowerCase()
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true
    if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
  }
  return fallback
}

