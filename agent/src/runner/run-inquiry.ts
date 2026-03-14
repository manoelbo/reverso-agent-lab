import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolveRuntimeConfig } from '../config/env.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'
import { limitText, loadPreviewsIncremental, slugify, writeUtf8 } from '../core/fs-io.js'
import { stripCodeFence } from '../core/markdown.js'
import { toRelative } from '../core/paths.js'
import type { LabPaths } from '../core/paths.js'
import type { FindingEvidence, InquiryScenario, VerificationStatus } from '../core/contracts.js'
import { OpenRouterClient } from '../llm/openrouter-client.js'
import {
  buildInquiryUserPrompt,
  buildInquirySystemPrompt,
  buildInquiryPlanningSystemPrompt,
  buildInquiryPlanningUserPrompt,
  type InquiryExecutionPlanIA,
  type InquiryIAResponse
} from '../prompts/inquiry.js'
import { appendLeadConclusion, persistInquiryArtifacts } from '../tools/investigative/create-lead-file.js'
import {
  buildResponseLanguageInstruction,
  resolveResponseLanguageForPrompt,
  type LanguageCode
} from '../core/language.js'
import { runAgentLoop } from '../core/agent-loop.js'
import {
  clampConfidence,
  createLoopBudget,
  type PlannedToolAction,
  type StructuredExecutionPlan,
  type StopReason
} from '../core/orchestration.js'
import {
  createPolicyComplianceHooks,
  type ComplianceDecision
} from '../core/compliance-hooks.js'
import {
  getToolDefinitions,
  getToolDefinition,
  validateToolCallInput,
  validatePlannedToolActions,
  type ToolCapability,
  type ToolRiskLevel,
  type ToolCall,
  type ToolName
} from '../core/tool-registry.js'
import {
  formatContractErrors,
  parseStrictJson,
  validateInquiryFinalPayload,
  validateInquiryPlanPayload
} from '../core/json-contract.js'
import {
  buildDefaultDomainPlans,
  runDomainSubagents,
  type DomainSubagentPlan,
  type DomainSubagentResult
} from '../core/domain-subagents.js'
import {
  buildCritiqueRepairSystemPrompt,
  buildCritiqueRepairUserPrompt
} from '../prompts/critique-repair.js'
import { keepVerifiedEvidence } from '../core/evidence-verifier.js'
import { verifyFindingEvidenceWithMode, type EvidenceVerificationMode } from '../core/evidence-semantic-verifier.js'
import { validateInquiryPreWrite } from '../core/pre-write-validation.js'
import {
  getInvestigationCheckpointPath,
  restoreInvestigationCheckpoint,
  saveInvestigationCheckpoint
} from '../core/investigation-checkpoint.js'
import { createDefaultEditorialGovernance } from '../core/editorial-governance.js'
import { sanitizeForLlm, type SensitiveDataPolicyMode } from '../core/sensitive-data-policy.js'
import {
  beginInquiryStage,
  createInquiryRunMetrics,
  endInquiryStage,
  finalizeInquiryMetrics,
  writeInquiryMetricsArtifact
} from '../core/inquiry-observability.js'

export interface RunInquiryOptions {
  lead: string
  model?: string
  responseLanguage?: string
  enablePev?: boolean
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
  p2EvidenceVerificationMode?: EvidenceVerificationMode
  p2ObservabilityEnabled?: boolean
  p2SensitiveDataPolicyMode?: SensitiveDataPolicyMode
  maxSteps?: number
  maxToolCalls?: number
  maxElapsedMs?: number
  confidenceThreshold?: number
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
}

interface ParsedInquiry {
  scenario: InquiryScenario
  confidence: number
  conclusion: string
  allegations: Array<{ id: string; statement: string }>
  findings: Array<{
    id: string
    claim: string
    status: VerificationStatus
    supportsAllegationIds: string[]
    evidence: FindingEvidence[]
  }>
}

interface InquiryContractResult {
  parsed: ParsedInquiry
  needsRepair: boolean
  repairReasons: string[]
}

class ContractValidationError extends Error {
  contractName: 'inquiry.plan' | 'inquiry.final'
  details: string
  lastRaw: string

  constructor(input: {
    contractName: 'inquiry.plan' | 'inquiry.final'
    details: string
    lastRaw: string
    afterSelfRepair: boolean
  }) {
    super(
      `[${input.contractName}] contract validation failed${input.afterSelfRepair ? ' after self-repair' : ''}: ${input.details}`
    )
    this.name = 'ContractValidationError'
    this.contractName = input.contractName
    this.details = input.details
    this.lastRaw = input.lastRaw
  }
}

export async function runInquiry(options: RunInquiryOptions): Promise<void> {
  const leadInput = options.lead?.trim()
  if (!leadInput) {
    throw new Error('Parametro obrigatorio: inquiry --lead <slug>')
  }

  const runtime = await resolveRuntimeConfig({
    ...(options.model ? { model: options.model } : {}),
    ...(options.responseLanguage ? { responseLanguage: options.responseLanguage } : {}),
    ...(typeof options.enablePev === 'boolean' ? { enablePev: options.enablePev } : {}),
    ...(typeof options.maxSteps === 'number' ? { maxSteps: options.maxSteps } : {}),
    ...(typeof options.maxToolCalls === 'number' ? { maxToolCalls: options.maxToolCalls } : {}),
    ...(typeof options.maxElapsedMs === 'number' ? { maxElapsedMs: options.maxElapsedMs } : {}),
    ...(typeof options.confidenceThreshold === 'number'
      ? { confidenceThreshold: options.confidenceThreshold }
      : {}),
    ...(typeof options.selfRepairEnabled === 'boolean'
      ? { selfRepairEnabled: options.selfRepairEnabled }
      : {}),
    ...(typeof options.selfRepairMaxRounds === 'number'
      ? { selfRepairMaxRounds: options.selfRepairMaxRounds }
      : {}),
    ...(typeof options.evidenceGateEnabled === 'boolean'
      ? { evidenceGateEnabled: options.evidenceGateEnabled }
      : {}),
    ...(typeof options.evidenceMinConfidence === 'number'
      ? { evidenceMinConfidence: options.evidenceMinConfidence }
      : {}),
    ...(typeof options.enrichedToolManifestEnabled === 'boolean'
      ? { enrichedToolManifestEnabled: options.enrichedToolManifestEnabled }
      : {}),
    ...(typeof options.strictPlanningValidation === 'boolean'
      ? { strictPlanningValidation: options.strictPlanningValidation }
      : {}),
    ...(typeof options.preWriteValidationEnabled === 'boolean'
      ? { preWriteValidationEnabled: options.preWriteValidationEnabled }
      : {}),
    ...(typeof options.preWriteValidationStrict === 'boolean'
      ? { preWriteValidationStrict: options.preWriteValidationStrict }
      : {}),
    ...(typeof options.criticalWriteGateEnabled === 'boolean'
      ? { criticalWriteGateEnabled: options.criticalWriteGateEnabled }
      : {}),
    ...(typeof options.requireExplicitWriteApproval === 'boolean'
      ? { requireExplicitWriteApproval: options.requireExplicitWriteApproval }
      : {}),
    ...(typeof options.p1ComplianceHooksEnabled === 'boolean'
      ? { p1ComplianceHooksEnabled: options.p1ComplianceHooksEnabled }
      : {}),
    ...(typeof options.p1DomainSubagentsEnabled === 'boolean'
      ? { p1DomainSubagentsEnabled: options.p1DomainSubagentsEnabled }
      : {}),
    ...(typeof options.p1CheckpointEnabled === 'boolean'
      ? { p1CheckpointEnabled: options.p1CheckpointEnabled }
      : {}),
    ...(typeof options.p1CheckpointRestore === 'boolean'
      ? { p1CheckpointRestore: options.p1CheckpointRestore }
      : {}),
    ...(typeof options.editorialGovernanceEnabled === 'boolean'
      ? { editorialGovernanceEnabled: options.editorialGovernanceEnabled }
      : {}),
    ...(typeof options.editorialGovernanceStrict === 'boolean'
      ? { editorialGovernanceStrict: options.editorialGovernanceStrict }
      : {}),
    ...(options.p2EvidenceVerificationMode
      ? { p2EvidenceVerificationMode: options.p2EvidenceVerificationMode }
      : {}),
    ...(typeof options.p2ObservabilityEnabled === 'boolean'
      ? { p2ObservabilityEnabled: options.p2ObservabilityEnabled }
      : {}),
    ...(options.p2SensitiveDataPolicyMode
      ? { p2SensitiveDataPolicyMode: options.p2SensitiveDataPolicyMode }
      : {})
  })
  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'inquiry',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))

  const slug = normalizeLeadInput(leadInput)
  const observabilityRunId = `${slug}-${Date.now().toString(36)}`
  const metrics = createInquiryRunMetrics({
    runId: observabilityRunId,
    leadSlug: slug,
    evidenceVerificationMode: runtime.p2EvidenceVerificationMode,
    sensitiveDataMode: runtime.p2SensitiveDataPolicyMode,
    evidenceGateEnabled: runtime.evidenceGateEnabled,
    preWriteValidationEnabled: runtime.preWriteValidationEnabled
  })
  let sensitiveOccurrences = 0
  let sensitiveBlocked = false
  const leadPath = path.join(runtime.paths.leadsDir, `lead-${slug}.md`)

  feedback.stepStart('inquiry-init', `Iniciando inquiry para lead: ${slug}`)
  let leadMarkdown = ''
  try {
    leadMarkdown = await readFile(leadPath, 'utf8')
  } catch {
    throw new Error(
      `Lead nao encontrado: ${toRelative(runtime.paths.projectRoot, leadPath)}. Rode create-lead antes.`
    )
  }

  const sourceSummary = await buildInquirySourceSummary(runtime.paths.sourceArtifactsDir, runtime.paths.sourceDir)
  const responseLanguage = resolveResponseLanguageForPrompt({
    mode: runtime.responseLanguage,
    fallback: runtime.defaultResponseLanguage,
    userText: leadMarkdown
  })
  const client = new OpenRouterClient(runtime.apiKey)
  let executionContext = 'Execution mode: legacy (single-pass).'
  let orchestrationStopReason: StopReason | undefined
  let repairedPlan: StructuredExecutionPlan | undefined
  const complianceEvents: string[] = []
  const restoredCheckpoint =
    runtime.p1CheckpointEnabled && runtime.p1CheckpointRestore
      ? await restoreInvestigationCheckpoint(runtime.paths.investigationDir, slug)
      : undefined
  if (restoredCheckpoint) {
    feedback.systemInfo(`Checkpoint restaurado: stage=${restoredCheckpoint.stage}`)
  }
  if (runtime.enablePev) {
    beginInquiryStage(metrics, 'plan')
    feedback.stepStart('pev-plan', 'Generating inquiry execution plan (plan -> execute -> verify)...')
    if (restoredCheckpoint?.repairedPlan) {
      repairedPlan = restoredCheckpoint.repairedPlan
      feedback.systemInfo('Usando plano restaurado do checkpoint.')
    } else {
      const planningLeadSanitized = sanitizeForLlm({
        text: limitText(leadMarkdown, 10_000),
        mode: runtime.p2SensitiveDataPolicyMode
      })
      const planningSummarySanitized = sanitizeForLlm({
        text: sourceSummary,
        mode: runtime.p2SensitiveDataPolicyMode
      })
      sensitiveOccurrences +=
        planningLeadSanitized.matches.length + planningSummarySanitized.matches.length
      if (planningLeadSanitized.blocked || planningSummarySanitized.blocked) {
        sensitiveBlocked = true
        throw new Error('Sensitive data policy (strict) bloqueou etapa de planejamento da inquiry.')
      }
      const plan = await createInquiryExecutionPlan({
        client,
        model: runtime.model,
        responseLanguage,
        leadSlug: slug,
        leadMarkdown: planningLeadSanitized.sanitizedText,
        sourceSummary: planningSummarySanitized.sanitizedText,
        selfRepairEnabled: runtime.selfRepairEnabled,
        selfRepairMaxRounds: runtime.selfRepairMaxRounds,
        enrichedToolManifestEnabled: runtime.enrichedToolManifestEnabled,
        feedback
      })
      repairedPlan = prevalidateAndRepairExecutionPlan(plan, runtime.paths.filesystemDir, feedback)
    }
    endInquiryStage(metrics, 'plan', { outcome: 'ok' })
    if (runtime.strictPlanningValidation) {
      const requireFinalPersist = repairedPlan.actions.some((action) => action.capability === 'persist')
      const validation = validatePlannedToolActions(repairedPlan.actions, {
        maxTotalEstimatedTokens: 8_000,
        requireFinalPersist
      })
      if (!validation.ok) {
        throw new Error(`Inquiry planning validation failed: ${validation.error}`)
      }
    }
    if (runtime.p1CheckpointEnabled && repairedPlan) {
      await saveInvestigationCheckpoint(runtime.paths.investigationDir, {
        leadSlug: slug,
        stage: 'planning',
        repairedPlan
      })
    }

    const loopBudget = createLoopBudget({
      maxSteps: runtime.loopMaxSteps,
      maxToolCalls: runtime.loopMaxToolCalls,
      maxElapsedMs: runtime.loopMaxElapsedMs
    })
    const threshold = runtime.confidenceThreshold
    feedback.systemInfo(
      `PEV enabled: steps<=${loopBudget.maxSteps}, tools<=${loopBudget.maxToolCalls}, timeout=${loopBudget.maxElapsedMs}ms, threshold=${threshold}`
    )
    let subagentContext = ''
    if (runtime.p1DomainSubagentsEnabled && repairedPlan) {
      const subagentPlans = buildDefaultDomainPlans(repairedPlan, sourceSummary)
      const subagentRun = await runDomainSubagents({
        plans: subagentPlans,
        executor: (plan) => executeDefaultDomainSubagent(plan),
        maxDomains: 3,
        timeoutMs: 2_000
      })
      subagentContext = renderDomainSubagentContext(subagentRun.outputs)
      if (subagentRun.warnings.length > 0) {
        for (const warning of subagentRun.warnings) {
          feedback.systemWarn(`[subagent] ${warning}`)
        }
      }
      feedback.systemInfo(
        `Subagentes executados: ${subagentRun.outputs.length}, evidencias unicas=${subagentRun.consolidatedEvidence.length}`
      )
    }

    const compliancePolicy = createCompliancePolicy('warn')

    feedback.planStart('pev-exec', 'Tool execution plan', repairedPlan.actions.map((a, i) => ({
      id: `action-${i}`,
      title: `${a.tool} (${a.capability})`
    })))
    feedback.stepStart('pev-execute', 'Executing planned tool actions...')

    let toolCallCounter = 0
    beginInquiryStage(metrics, 'execute')
    const loopRun = await runAgentLoop({
      actions: toToolCalls(repairedPlan.actions),
      ctx: { paths: runtime.paths },
      budget: loopBudget,
      confidenceThreshold: threshold,
      verifier: ({ result }) => {
        if (!result?.ok) {
          const gaps = mapToolResultGaps(result)
          const reason = result?.errorCode === 'input_validation' ? 'insufficient_evidence' : 'tool_error'
          return {
            ok: false,
            confidence: 0.35,
            reason,
            gaps
          }
        }
        return {
          ok: true,
          confidence: 0.78,
          reason: 'progress_observed',
          gaps: []
        }
      },
      hooks: {
        onToolCall: ({ tool, inputSummary }) => {
          const toolId = `tool-${toolCallCounter++}`
          feedback.toolStart(toolId, tool, inputSummary)
        },
        onToolResult: ({ tool, ok, outputSummary, durationMs }) => {
          const toolId = `tool-${toolCallCounter - 1}`
          if (ok) {
            feedback.toolSuccess(toolId, outputSummary, durationMs)
          } else {
            feedback.toolError(toolId, outputSummary ?? 'Tool error')
          }
          if (repairedPlan) {
            feedback.planStepUpdate('pev-exec', `action-${Math.min(toolCallCounter - 1, repairedPlan.actions.length - 1)}`, ok ? 'done' : 'error')
          }
        },
        onComplianceDecision: ({ phase, tool, decision, reason }) => {
          complianceEvents.push(`${phase}:${tool}:${decision}:${reason}`)
          if (decision === 'warn') {
            feedback.systemWarn(`[compliance/${phase}] ${tool}: ${reason}`)
          }
          if (decision === 'deny') {
            feedback.systemWarn(`[compliance/${phase}] ${tool}: blocked (${reason})`)
          }
        },
        onBudgetUpdated: ({ step, usage, budget }) => {
          feedback.loopProgress(step, usage, budget)
        },
        onVerificationResult: ({ step, ok, confidence, reason, gaps }) => {
          feedback.loopVerification(step, ok, confidence, reason, gaps)
        },
        onStopped: ({ step, failures, stopReason }) => {
          feedback.loopStopped(step, failures, stopReason)
          if (stopReason === 'no_progress') {
            feedback.requestApproval(
              randomUUID().slice(0, 8),
              'Loop detectado',
              'O agente está repetindo a mesma busca. Isso pode indicar que as fontes não contêm a informação procurada. A inquiry continuará tentando consolidar o que foi encontrado até aqui.'
            )
          }
        }
      },
      ...(runtime.p1ComplianceHooksEnabled
        ? {
            compliance: createPolicyComplianceHooks(compliancePolicy)
          }
        : {})
    })
    orchestrationStopReason = loopRun.stopReason
    endInquiryStage(metrics, 'execute', {
      outcome: loopRun.stopReason === 'goal_reached' ? 'ok' : 'skipped',
      details: `stop_reason=${loopRun.stopReason}`
    })
    const loopSummary = summarizeLoop(repairedPlan, loopRun)
    executionContext = [
      'Execution mode: plan -> execute -> verify.',
      `Planner objective: ${repairedPlan.objective}`,
      `Planner success criteria: ${repairedPlan.successCriteria.join(' | ') || '(none)'}`,
      `Planner stop criteria: ${repairedPlan.stopCriteria.join(' | ') || '(none)'}`,
      ...(subagentContext ? [subagentContext] : []),
      ...(complianceEvents.length > 0 ? [`Compliance events: ${complianceEvents.join(' | ')}`] : []),
      loopSummary
    ].join('\n')
    if (loopRun.stopReason === 'goal_reached') {
      feedback.stepComplete('pev-execute', `PEV tool execution finished with stop_reason=${loopRun.stopReason}`)
    } else {
      feedback.stepError('pev-execute', `PEV tool execution finished with stop_reason=${loopRun.stopReason}`)
    }
    if (runtime.p1CheckpointEnabled) {
      await saveInvestigationCheckpoint(runtime.paths.investigationDir, {
        leadSlug: slug,
        stage: 'post_tools',
        ...(repairedPlan ? { repairedPlan } : {}),
        loopProgress: {
          stopReason: loopRun.stopReason,
          steps: loopRun.usage.steps,
          toolCalls: loopRun.usage.toolCalls,
          confidence: loopRun.confidence
        }
      })
    }
  }

  const finalUserPrompt = buildInquiryUserPrompt({
    leadSlug: slug,
    leadMarkdown: limitText(leadMarkdown, 10_000),
    sourceSummary,
    executionContext
  })
  const sanitizedPrompt = sanitizeForLlm({
    text: finalUserPrompt,
    mode: runtime.p2SensitiveDataPolicyMode
  })
  sensitiveOccurrences += sanitizedPrompt.matches.length
  if (sanitizedPrompt.matches.length > 0 && runtime.p2SensitiveDataPolicyMode !== 'off') {
    feedback.systemWarn(
      `[sensitive-data] ${sanitizedPrompt.matches.length} ocorrência(s) detectada(s) em prompt de inquiry (${runtime.p2SensitiveDataPolicyMode}).`
    )
  }
  if (sanitizedPrompt.blocked) {
    sensitiveBlocked = true
    throw new Error('Sensitive data policy (strict) bloqueou envio do prompt ao LLM.')
  }

  beginInquiryStage(metrics, 'verify')
  feedback.stepStart('inquiry-llm', 'Executando inquiry com LLM...')
  const contract = await requestStrictInquiryPayload({
    client,
    model: runtime.model,
    systemPrompt: buildInquirySystemPrompt(buildResponseLanguageInstruction(responseLanguage)),
    userPrompt: sanitizedPrompt.sanitizedText,
    selfRepairEnabled: runtime.selfRepairEnabled,
    selfRepairMaxRounds: runtime.selfRepairMaxRounds,
    feedback
  })
  const parsed = contract.parsed
  if (parsed.confidence < runtime.confidenceThreshold) {
    feedback.systemWarn(
      `Inquiry confidence (${parsed.confidence.toFixed(2)}) below threshold (${runtime.confidenceThreshold.toFixed(2)}).`
    )
  }
  feedback.stepComplete('inquiry-llm', `Cenario identificado: ${parsed.scenario}`)

  let findingsToPersist = parsed.findings
  let reviewQueue: ParsedInquiry['findings'] = []
  if (runtime.evidenceGateEnabled) {
    feedback.stepStart('evidence-gate', `Applying evidence gate (minConfidence=${runtime.evidenceMinConfidence.toFixed(2)})...`)
    const verificationResult = await verifyFindingsWithGate(
      parsed.findings,
      runtime.paths,
      runtime.evidenceMinConfidence,
      runtime.p2EvidenceVerificationMode
    )
    findingsToPersist = verificationResult.verified
    reviewQueue = verificationResult.reviewQueue
    feedback.stepComplete('evidence-gate', `persisted=${findingsToPersist.length}, review_queue=${reviewQueue.length}`)
  }

  if (runtime.preWriteValidationEnabled) {
    feedback.stepStart('pre-write', 'Running pre-write validation (schema + refs + language)...')
    const governanceTargets = runtime.editorialGovernanceMode !== 'off'
      ? buildInquiryGovernanceTargets({
          slug,
          allegations: parsed.allegations,
          findings: findingsToPersist,
          reviewQueue
        })
      : []
    const preWrite = await validateInquiryPreWrite({
      slug,
      allegations: parsed.allegations,
      findings: findingsToPersist,
      reviewQueue,
      expectedLanguage: responseLanguage,
      editorialGovernanceTargets: governanceTargets,
      editorialGovernanceMode: runtime.editorialGovernanceMode,
      paths: runtime.paths
    })
    for (const warning of preWrite.warnings) {
      feedback.systemWarn(`[pre-write] ${warning}`)
    }
    if (!preWrite.ok) {
      const details = preWrite.errors.join(' | ')
      if (runtime.preWriteValidationStrict) {
        throw new Error(`Pre-write validation failed: ${details}`)
      }
      feedback.systemWarn(`Pre-write validation failed (non-strict): ${details}`)
    } else {
      feedback.stepComplete('pre-write', 'Pre-write validation passed')
    }
  }

  const gate = resolveCriticalWriteGateDecision({
    gateEnabled: runtime.criticalWriteGateEnabled,
    requireExplicitWriteApproval: runtime.requireExplicitWriteApproval,
    hasPersistActionPlanned: Boolean(repairedPlan?.actions.some((action) => action.capability === 'persist')),
    ...(orchestrationStopReason ? { orchestrationStopReason } : {})
  })
  endInquiryStage(metrics, 'verify', { outcome: 'ok' })
  beginInquiryStage(metrics, 'persist')
  if (runtime.p1CheckpointEnabled) {
    await saveInvestigationCheckpoint(runtime.paths.investigationDir, {
      leadSlug: slug,
      stage: 'pre_persist',
      ...(repairedPlan ? { repairedPlan } : {}),
      ...(orchestrationStopReason
        ? {
            loopProgress: {
              stopReason: orchestrationStopReason,
              steps: 0,
              toolCalls: 0,
              confidence: parsed.confidence
            }
          }
        : {}),
      gate,
      reviewQueueIds: reviewQueue.map((item) => item.id),
      repairState: {
        needsRepair: contract.needsRepair,
        reasons: contract.repairReasons
      }
    })
  }
  if (!gate.approved) {
    feedback.systemWarn(`Critical write gate bloqueou persistencia: ${gate.reason}`)
    const diagnosticPath = await writeInquiryDiagnosticArtifact({
      paths: runtime.paths,
      slug,
      gate,
      contract
    })
    feedback.fileCreated(toRelative(runtime.paths.projectRoot, diagnosticPath), 0, 'Diagnostico do inquiry (gate/repair).')
    feedback.summary('Inquiry concluida sem persistencia critica', [
      `Stop reason: ${resolveFinalStopReason(parsed, orchestrationStopReason, runtime.confidenceThreshold)}`,
      `Confidence: ${parsed.confidence.toFixed(2)}`,
      `Write gate: blocked (${gate.reason})`,
      ...(runtime.p1CheckpointEnabled
        ? [
            `Checkpoint: ${toRelative(
              runtime.paths.projectRoot,
              getInvestigationCheckpointPath(runtime.paths.investigationDir, slug)
            )}`
          ]
        : []),
      `Diagnostico: ${toRelative(runtime.paths.projectRoot, diagnosticPath)}`,
      'Nenhum artifact critico (allegation/finding/conclusion) foi persistido nesta rodada.'
    ])
    endInquiryStage(metrics, 'persist', { outcome: 'skipped', details: gate.reason })
    const finalizedMetrics = finalizeInquiryMetrics({
      metrics,
      stopReason: resolveFinalStopReason(parsed, orchestrationStopReason, runtime.confidenceThreshold),
      parsedFindings: parsed.findings.length,
      persistedFindings: 0,
      reviewQueueFindings: reviewQueue.length,
      sensitiveOccurrences,
      sensitiveBlocked,
      criticalWriteGateMode: gate.mode
    })
    if (runtime.p2ObservabilityEnabled) {
      const metricsPath = await writeInquiryMetricsArtifact({
        eventsDir: runtime.paths.eventsDir,
        metrics: finalizedMetrics
      })
      feedback.fileCreated(toRelative(runtime.paths.projectRoot, metricsPath), 0, 'Métricas operacionais de inquiry.')
    }
    if (ownsFeedback) {
      await feedback.flush()
    }
    return
  }

  const persisted = await persistInquiryArtifacts(
    {
      slug,
      language: responseLanguage,
      allegations: parsed.allegations,
      findings: findingsToPersist,
      reviewQueue,
      audit: {
        criticalWriteGate: gate.mode,
        needsRepair: contract.needsRepair,
        repairReasons: contract.repairReasons
      },
      ...(runtime.editorialGovernanceMode !== 'off'
        ? { governance: createDefaultEditorialGovernance() }
        : {})
    },
    { paths: runtime.paths }
  )

  for (const p of persisted.allegationPaths) {
    feedback.fileCreated(toRelative(runtime.paths.projectRoot, p), 0, 'Allegation gerada pelo inquiry.')
  }
  for (const p of persisted.findingPaths) {
    feedback.fileCreated(toRelative(runtime.paths.projectRoot, p), 0, 'Finding gerado pelo inquiry.')
  }
  if (persisted.reviewPath) {
    feedback.fileCreated(toRelative(runtime.paths.projectRoot, persisted.reviewPath), 0, 'Fila de revisão de evidências (weak/missing).')
  }

  const leadUpdated = await appendLeadConclusion(
    {
      slug,
      language: responseLanguage,
      scenario: parsed.scenario,
      conclusion: parsed.conclusion,
      audit: {
        criticalWriteGate: gate.mode,
        needsRepair: contract.needsRepair,
        repairReasons: contract.repairReasons
      },
      ...(runtime.editorialGovernanceMode !== 'off'
        ? { governance: createDefaultEditorialGovernance() }
        : {})
    },
    { paths: runtime.paths }
  )
  if (runtime.p1CheckpointEnabled) {
    await saveInvestigationCheckpoint(runtime.paths.investigationDir, {
      leadSlug: slug,
      stage: 'post_persist',
      ...(repairedPlan ? { repairedPlan } : {}),
      ...(orchestrationStopReason
        ? {
            loopProgress: {
              stopReason: orchestrationStopReason,
              steps: 0,
              toolCalls: 0,
              confidence: parsed.confidence
            }
          }
        : {}),
      gate,
      reviewQueueIds: reviewQueue.map((item) => item.id),
      repairState: {
        needsRepair: contract.needsRepair,
        reasons: contract.repairReasons
      }
    })
  }
  feedback.fileEdited(toRelative(runtime.paths.projectRoot, leadUpdated))

  if (feedback.allegation) {
    for (const allegation of parsed.allegations) {
      const relatedFindings = findingsToPersist
        .filter((f) => f.supportsAllegationIds.includes(allegation.id))
        .map((f) => ({
          id: f.id,
          text: f.claim,
          status: f.status,
          sourceRefs: f.evidence.map((e) => e.source_id).filter(Boolean),
        }))
      feedback.allegation({
        id: allegation.id,
        title: allegation.statement,
        leadSlug: `lead-${slug}`,
        status: 'pending',
        findings: relatedFindings,
      })
    }
  }

  const finalStopReason = resolveFinalStopReason(parsed, orchestrationStopReason, runtime.confidenceThreshold)
  endInquiryStage(metrics, 'persist', { outcome: 'ok' })
  const finalizedMetrics = finalizeInquiryMetrics({
    metrics,
    stopReason: finalStopReason,
    parsedFindings: parsed.findings.length,
    persistedFindings: persisted.findingPaths.length,
    reviewQueueFindings: reviewQueue.length,
    sensitiveOccurrences,
    sensitiveBlocked,
    criticalWriteGateMode: gate.mode
  })
  if (runtime.p2ObservabilityEnabled) {
      const metricsPath = await writeInquiryMetricsArtifact({
        eventsDir: runtime.paths.eventsDir,
        metrics: finalizedMetrics
      })
      feedback.fileCreated(toRelative(runtime.paths.projectRoot, metricsPath), 0, 'Métricas operacionais de inquiry.')
    }
  feedback.summary('Inquiry concluida', [
    `Stop reason: ${finalStopReason}`,
    `Confidence: ${parsed.confidence.toFixed(2)}`,
    `Write gate: ${gate.mode}`,
    ...(runtime.p1CheckpointEnabled
      ? [
          `Checkpoint: ${toRelative(
            runtime.paths.projectRoot,
            getInvestigationCheckpointPath(runtime.paths.investigationDir, slug)
          )}`
        ]
      : []),
    ...(contract.needsRepair ? [`Contract repair state: needs_repair (${contract.repairReasons.join(' | ')})`] : []),
    `Lead atualizado: ${toRelative(runtime.paths.projectRoot, leadUpdated)}`,
    `Allegations: ${persisted.allegationPaths.length}`,
    `Findings: ${persisted.findingPaths.length}`,
    ...(runtime.evidenceGateEnabled
      ? [`Review queue (weak/missing): ${reviewQueue.length}`]
      : []),
    parsed.scenario === 'plan_another_inquiry'
      ? 'Recomendacao: executar inquiry novamente com estrategia complementar.'
      : 'Resultado consolidado no lead.',
    ...(finalStopReason === 'no_progress'
      ? [buildNoProgressRecommendation()]
      : [])
  ])

  if (ownsFeedback) {
    await feedback.flush()
  }
}

function normalizeLeadInput(value: string): string {
  const trimmed = value.trim().replace(/\.md$/i, '')
  const withoutPrefix = trimmed.startsWith('lead-') ? trimmed.slice('lead-'.length) : trimmed
  const slug = slugify(withoutPrefix)
  if (!slug) throw new Error('Slug do lead invalido.')
  return slug
}

function normalizeScenario(value: string | undefined): InquiryScenario {
  if (value === 'positive' || value === 'negative' || value === 'plan_another_inquiry') {
    return value
  }
  return 'negative'
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeEvidence(evidence: unknown): FindingEvidence[] {
  if (!Array.isArray(evidence)) return []
  return evidence
    .map((item) => {
      const source_id = typeof (item as { source_id?: unknown })?.source_id === 'string'
        ? String((item as { source_id?: string }).source_id).trim()
        : typeof (item as { source?: unknown })?.source === 'string'
          ? String((item as { source?: string }).source).trim()
          : ''
      const source = source_id
      const excerpt = typeof (item as { excerpt?: unknown })?.excerpt === 'string'
        ? String((item as { excerpt?: string }).excerpt).trim()
        : ''
      const pageRaw = (item as { page?: unknown })?.page
      const page =
        typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : undefined
      const locationRaw = (item as { location?: unknown })?.location
      const location =
        typeof locationRaw === 'object' && locationRaw !== null
          ? (locationRaw as FindingEvidence['location'])
          : page !== undefined
            ? ({ kind: 'pdf', page } as const)
            : ({ kind: 'unknown', hint: 'location_not_provided' } as const)
      const confidenceRaw = (item as { confidence?: unknown })?.confidence
      const confidence =
        typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
          ? Math.min(1, Math.max(0, confidenceRaw))
          : 0.5
      const verificationRaw = (item as { verification_status?: unknown })?.verification_status
      const verification_status: FindingEvidence['verification_status'] =
        verificationRaw === 'verified' || verificationRaw === 'weak' || verificationRaw === 'missing'
          ? verificationRaw
          : 'weak'
      const verification_notes = Array.isArray((item as { verification_notes?: unknown })?.verification_notes)
        ? (item as { verification_notes?: unknown[] }).verification_notes
            ?.filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
            .map((note) => note.trim())
        : undefined
      if (!source || !excerpt) return undefined
      return {
        source_id,
        source,
        excerpt,
        location,
        confidence,
        verification_status,
        ...(page !== undefined ? { page } : {}),
        ...(verification_notes && verification_notes.length > 0 ? { verification_notes } : {})
      }
    })
    .filter((item): item is FindingEvidence => Boolean(item))
}

export function parseInquiryResponse(raw: string): ParsedInquiry {
  const cleaned = stripCodeFence(raw.trim())
  try {
    const parsed = JSON.parse(cleaned) as InquiryIAResponse
    const allegations = (parsed.allegations ?? [])
      .map((item, idx) => ({
        id: slugify(item?.id || `allegation-${idx + 1}`) || `allegation-${idx + 1}`,
        statement: typeof item?.statement === 'string' ? item.statement.trim() : ''
      }))
      .filter((item) => item.statement.length > 0)

    const allegationSet = new Set(allegations.map((item) => item.id))
    const findings = (parsed.findings ?? [])
      .map((item, idx) => {
        const claim = typeof item?.claim === 'string' ? item.claim.trim() : ''
        const statusRaw = item?.status
        const status: VerificationStatus =
          statusRaw === 'verified' || statusRaw === 'rejected' || statusRaw === 'unverified'
            ? statusRaw
            : 'unverified'
        const supportsAllegationIds = asStringList(item?.supportsAllegationIds)
          .map((id) => slugify(id) || id)
          .filter((id) => allegationSet.has(id))
        return {
          id: slugify(item?.id || `finding-${idx + 1}`) || `finding-${idx + 1}`,
          claim,
          status,
          supportsAllegationIds,
          evidence: normalizeEvidence(item?.evidence)
        }
      })
      .filter((item) => item.claim.length > 0 && item.evidence.length > 0)

    const confidence = clampConfidence(parsed.confidence, 0.7)
    const scenario = normalizeScenario(parsed.scenario)
    const conclusion =
      typeof parsed.conclusion === 'string' && parsed.conclusion.trim().length > 0
        ? parsed.conclusion.trim()
        : defaultConclusion(scenario)

    return { scenario, confidence, conclusion, allegations, findings }
  } catch {
    return {
      scenario: 'negative',
      confidence: 0.4,
      conclusion: defaultConclusion('negative'),
      allegations: [],
      findings: []
    }
  }
}

export function recoverInquiryFromRawPayload(raw: string): {
  parsed: ParsedInquiry
  rawFindings: number
  droppedFindings: number
} {
  const parsed = parseInquiryResponse(raw)
  const strictParsed = parseStrictJson(raw)
  let rawFindings = 0
  if (strictParsed.ok && typeof strictParsed.value === 'object' && strictParsed.value !== null) {
    const findings = (strictParsed.value as { findings?: unknown }).findings
    rawFindings = Array.isArray(findings) ? findings.length : 0
  }
  const droppedFindings = Math.max(0, rawFindings - parsed.findings.length)
  return { parsed, rawFindings, droppedFindings }
}

async function requestStrictInquiryPayload(input: {
  client: OpenRouterClient
  model: string
  systemPrompt: string
  userPrompt: string
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
}): Promise<InquiryContractResult> {
  let validated: ParsedInquiry
  try {
    validated = await requestContractJson({
      client: input.client,
      model: input.model,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      contractName: 'inquiry.final',
      hardRules: [
        'Return one JSON object only.',
        'Required keys: scenario, confidence, conclusion, allegations, findings.',
        'Every finding must contain evidence with source_id, excerpt, location, confidence, verification_status.',
        'Do not output findings without evidence.'
      ],
      selfRepairEnabled: input.selfRepairEnabled,
      selfRepairMaxRounds: input.selfRepairMaxRounds,
      feedback: input.feedback,
      validator: validateInquiryFinalPayload
    })
  } catch (error) {
    if (!(error instanceof ContractValidationError) || error.contractName !== 'inquiry.final') {
      throw error
    }
    input.feedback.systemWarn(
      `[inquiry.final] contract validation failed; applying safe fallback and continuing. (${error.details})`
    )
    const recovered = recoverInquiryFromRawPayload(error.lastRaw)
    if (recovered.droppedFindings > 0) {
      input.feedback.systemWarn(
        `[inquiry.final] removed ${recovered.droppedFindings} finding(s) without valid evidence to preserve contract integrity.`
      )
    }
    if (recovered.rawFindings === 0 && recovered.parsed.findings.length === 0) {
      input.feedback.systemWarn(
        '[inquiry.final] no valid findings recovered; proceeding with safe negative fallback.'
      )
    }
    const reasons = deriveNeedsRepairReasons({
      droppedFindings: recovered.droppedFindings,
      rawFindings: recovered.rawFindings,
      parsedFindings: recovered.parsed.findings.length
    })
    return {
      parsed: recovered.parsed,
      needsRepair: true,
      repairReasons: reasons
    }
  }

  let finalPayload = validated
  if (input.selfRepairEnabled && input.selfRepairMaxRounds > 0) {
    // Mandatory short critique/review pass before persisting artifacts.
    const repairedRaw = await input.client.chatText({
      model: input.model,
      system: buildCritiqueRepairSystemPrompt(),
      user: buildCritiqueRepairUserPrompt({
        contractName: 'inquiry.final',
        hardRules: [
          'Preserve original meaning and keep only evidence-backed findings.',
          'Do not remove required keys.',
          'Each evidence item must include source_id, excerpt, location, confidence, verification_status.',
          'Return JSON object only.'
        ],
        inputJson: JSON.stringify(validated)
      }),
      temperature: 0.05
    })
    const repairedJson = parseStrictJson(repairedRaw)
    if (!repairedJson.ok) {
      throw new Error(
        `Inquiry self-repair returned invalid JSON: ${formatContractErrors(repairedJson.errors)}`
      )
    }
    const repairedContract = validateInquiryFinalPayload(repairedJson.value)
    if (!repairedContract.ok) {
      throw new Error(
        `Inquiry self-repair broke contract: ${formatContractErrors(repairedContract.errors)}`
      )
    }
    finalPayload = repairedContract.value
  }

  return {
    parsed: parseInquiryResponse(JSON.stringify(finalPayload)),
    needsRepair: false,
    repairReasons: []
  }
}

export function deriveNeedsRepairReasons(input: {
  droppedFindings: number
  rawFindings: number
  parsedFindings: number
}): string[] {
  const reasons: string[] = ['contract_validation_failed']
  if (input.droppedFindings > 0) {
    reasons.push(`dropped_findings:${input.droppedFindings}`)
  }
  if (input.rawFindings === 0 && input.parsedFindings === 0) {
    reasons.push('no_valid_findings_recovered')
  }
  return reasons
}

async function requestContractJson<T>(input: {
  client: OpenRouterClient
  model: string
  systemPrompt: string
  userPrompt: string
  contractName: 'inquiry.plan' | 'inquiry.final'
  hardRules: string[]
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  feedback: UiFeedbackController
  validator: (value: unknown) => { ok: true; value: T } | { ok: false; errors: Array<{ path: string; message: string }> }
}): Promise<T> {
  let raw = await input.client.chatText({
    model: input.model,
    system: input.systemPrompt,
    user: input.userPrompt,
    temperature: 0.2
  })
  const validateRaw = (): { ok: true; value: T } | { ok: false; error: string } => {
    const parsed = parseStrictJson(raw)
    if (!parsed.ok) return { ok: false, error: formatContractErrors(parsed.errors) }
    const contract = input.validator(parsed.value)
    if (!contract.ok) return { ok: false, error: formatContractErrors(contract.errors) }
    return { ok: true, value: contract.value }
  }

  let attempt = validateRaw()
  if (attempt.ok) return attempt.value

  if (!input.selfRepairEnabled || input.selfRepairMaxRounds <= 0) {
    throw new ContractValidationError({
      contractName: input.contractName,
      details: attempt.error,
      lastRaw: raw,
      afterSelfRepair: false
    })
  }

  for (let round = 1; round <= input.selfRepairMaxRounds; round += 1) {
    input.feedback.systemWarn(`[${input.contractName}] invalid payload; self-repair round ${round}...`)
    raw = await input.client.chatText({
      model: input.model,
      system: buildCritiqueRepairSystemPrompt(),
      user: buildCritiqueRepairUserPrompt({
        contractName: input.contractName,
        hardRules: input.hardRules,
        inputJson: raw
      }),
      temperature: 0.05
    })
    attempt = validateRaw()
    if (attempt.ok) return attempt.value
  }

  throw new ContractValidationError({
    contractName: input.contractName,
    details: attempt.error,
    lastRaw: raw,
    afterSelfRepair: true
  })
}

async function createInquiryExecutionPlan(input: {
  client: OpenRouterClient
  model: string
  responseLanguage: LanguageCode
  leadSlug: string
  leadMarkdown: string
  sourceSummary: string
  selfRepairEnabled: boolean
  selfRepairMaxRounds: number
  enrichedToolManifestEnabled: boolean
  feedback: UiFeedbackController
}): Promise<StructuredExecutionPlan> {
  const toolManifest = input.enrichedToolManifestEnabled
    ? getToolDefinitions()
        .map(
          (tool, index) =>
            `${index + 1}. ${tool.name} (capabilities: ${tool.capabilities.join(', ')} | sideEffects: ${tool.sideEffects} | risk: ${tool.riskLevel} | estimatedCost: tokens=${tool.estimatedCost.tokens}, latencyMs=${tool.estimatedCost.latencyMs} | required: ${tool.requiredFields.join(', ')})`
        )
        .join('\n')
    : getToolDefinitions()
        .map((tool, index) => `${index + 1}. ${tool.name} (required: ${tool.requiredFields.join(', ')})`)
        .join('\n')
  const raw = await requestContractJson({
    client: input.client,
    model: input.model,
    systemPrompt: buildInquiryPlanningSystemPrompt(buildResponseLanguageInstruction(input.responseLanguage)),
    userPrompt: buildInquiryPlanningUserPrompt({
      leadSlug: input.leadSlug,
      leadMarkdown: input.leadMarkdown,
      sourceSummary: input.sourceSummary,
      toolManifest
    }),
    contractName: 'inquiry.plan',
    hardRules: [
      'Return one JSON object only.',
      'Required keys: objective, hypotheses, actions, successCriteria, stopCriteria, confidenceTarget.',
      'Each action must include tool, capability, rationale, expectedOutput, riskLevel, estimatedCost and input object.'
    ],
    selfRepairEnabled: input.selfRepairEnabled,
    selfRepairMaxRounds: input.selfRepairMaxRounds,
    feedback: input.feedback,
    validator: validateInquiryPlanPayload
  })

  const parsed = raw as InquiryExecutionPlanIA
  const actions = normalizePlanActions(parsed.actions)
  return {
    objective:
      typeof parsed.objective === 'string' && parsed.objective.trim().length > 0
        ? parsed.objective.trim()
        : 'Run inquiry with bounded and auditable tool actions.',
    hypotheses: asStringList(parsed.hypotheses).slice(0, 6),
    actions,
    successCriteria: asStringList(parsed.successCriteria).slice(0, 8),
    stopCriteria: asStringList(parsed.stopCriteria).slice(0, 8),
    confidenceTarget: clampConfidence(parsed.confidenceTarget, 0.75)
  }
}

function prevalidateAndRepairExecutionPlan(
  plan: StructuredExecutionPlan,
  filesystemDir: string,
  feedback: UiFeedbackController
): StructuredExecutionPlan {
  const firstPass = validatePlanToolInputs(plan.actions)
  if (firstPass.length === 0) return plan
  feedback.systemWarn(
    `[inquiry.plan] invalid tool inputs detected (${firstPass.length}); applying one repair pass before loop.`
  )
  const repairedActions = repairPlanActions(plan.actions, firstPass, filesystemDir)
  const secondPass = validatePlanToolInputs(repairedActions)
  if (secondPass.length > 0) {
    throw new Error(
      `Inquiry planning validation failed after repair: ${secondPass
        .map((item) => `#${item.index + 1} ${item.tool}: ${item.error}`)
        .join(' | ')}`
    )
  }
  return {
    ...plan,
    actions: repairedActions
  }
}

function validatePlanToolInputs(
  actions: PlannedToolAction[]
): Array<{ index: number; tool: string; error: string; missingFields: string[] }> {
  const issues: Array<{ index: number; tool: string; error: string; missingFields: string[] }> = []
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]
    if (!action) continue
    const call: ToolCall = {
      tool: action.tool as ToolName,
      input: action.input
    }
    const validation = validateToolCallInput(call)
    if (!validation.ok) {
      issues.push({
        index,
        tool: action.tool,
        error: validation.error,
        missingFields: validation.missingFields ?? []
      })
      continue
    }
    if (action.tool === 'processSourceTool') {
      const input = action.input as Record<string, unknown>
      const subcommand =
        typeof input.subcommand === 'string' ? normalizeProcessSourceSubcommand(input.subcommand) : undefined
      if (!subcommand) {
        issues.push({
          index,
          tool: action.tool,
          error: 'invalid_subcommand',
          missingFields: ['subcommand']
        })
      }
      continue
    }
  }
  return issues
}

function repairPlanActions(
  actions: PlannedToolAction[],
  issues: Array<{ index: number; missingFields: string[] }>,
  filesystemDir: string
): PlannedToolAction[] {
  const issueByIndex = new Map<number, { missingFields: string[] }>()
  for (const issue of issues) {
    issueByIndex.set(issue.index, { missingFields: issue.missingFields })
  }
  return actions.map((action, index) => {
    const definition = getToolDefinition(action.tool)
    const issue = issueByIndex.get(index)
    if (!definition) return action
    const input =
      typeof action.input === 'object' && action.input !== null && !Array.isArray(action.input)
        ? { ...(action.input as Record<string, unknown>) }
        : {}
    for (const field of issue?.missingFields ?? []) {
      if (input[field] !== undefined && input[field] !== null) continue
      input[field] = defaultFieldValue(field, filesystemDir, action)
    }
    if (action.tool === 'processSourceTool') {
      const current = typeof input.subcommand === 'string' ? input.subcommand : ''
      input.subcommand = normalizeProcessSourceSubcommand(current) ?? 'queue-status'
    }
    return {
      ...action,
      capability: definition.capabilities.includes(action.capability)
        ? action.capability
        : definition.capabilities[0] ?? ('read' as ToolCapability),
      riskLevel: definition.riskLevel as ToolRiskLevel,
      estimatedCost: {
        tokens: definition.estimatedCost.tokens,
        latencyMs: definition.estimatedCost.latencyMs
      },
      input
    }
  }).sort((a, b) => {
    const aPersist = a.capability === 'persist' ? 1 : 0
    const bPersist = b.capability === 'persist' ? 1 : 0
    return aPersist - bPersist
  })
}

function defaultFieldValue(
  field: string,
  filesystemDir: string,
  action: PlannedToolAction
): unknown {
  if (field === 'subcommand') return 'queue-status'
  if (field === 'filePath') return path.join(filesystemDir, 'agent.md')
  if (field === 'type') return 'person'
  if (field === 'name') return `auto-${slugify(action.tool) || 'entity'}`
  if (field === 'summary') return action.expectedOutput || 'Auto-generated summary'
  if (field === 'date') return new Date().toISOString().slice(0, 10)
  if (field === 'actors') return ['Agente']
  if (field === 'eventType') return 'inquiry_event'
  if (field === 'source') return 'inquiry'
  if (field === 'description') return action.rationale || 'Auto-generated description'
  return `auto_${field}`
}

function normalizeProcessSourceSubcommand(raw: string): string | undefined {
  const normalized = raw.trim().toLowerCase().replace(/_/g, '-')
  if (!normalized) return undefined
  const aliases: Record<string, string> = {
    'process-all-available-sources': 'process-all',
    'process-all-sources': 'process-all',
    'process-available-sources': 'process-all',
    'process-selected-sources': 'process-selected',
    'process-queued-sources': 'process-queue',
    'queue-status-check': 'queue-status'
  }
  const candidate = aliases[normalized] ?? normalized
  const allowed = new Set([
    'process-all',
    'process-selected',
    'process-queue',
    'queue-status',
    'queue-clear',
    'watch',
    'select'
  ])
  return allowed.has(candidate) ? candidate : undefined
}

function mapToolResultGaps(
  result: { error?: string; errorCode?: string; meta?: { missingFields?: string[] } } | undefined
): string[] {
  if (!result) return ['tool_error']
  if (result.errorCode === 'input_validation') {
    const missing = result.meta?.missingFields ?? []
    if (missing.length > 0) {
      return [`missing_fields:${missing.join(',')}`]
    }
    if ((result.error ?? '').toLowerCase().includes('subcommand')) {
      return ['invalid_subcommand']
    }
    return ['input_validation']
  }
  if (result.errorCode === 'permission_denied') return ['permission_denied']
  if (result.errorCode === 'runtime_exception') return ['runtime_exception']
  return ['tool_error']
}

function normalizePlanActions(actions: InquiryExecutionPlanIA['actions']): PlannedToolAction[] {
  if (!Array.isArray(actions)) return []
  const normalized: PlannedToolAction[] = []
  for (const item of actions) {
    if (!item || typeof item !== 'object') continue
    const toolRaw = typeof item.tool === 'string' ? item.tool.trim() : ''
    if (!toolRaw) continue
    const definition = getToolDefinition(toolRaw)
    if (!definition) continue
    const capabilityRaw = typeof item.capability === 'string' ? item.capability.trim() : ''
    if (
      capabilityRaw !== 'read' &&
      capabilityRaw !== 'extract' &&
      capabilityRaw !== 'crosscheck' &&
      capabilityRaw !== 'persist'
    ) {
      continue
    }
    if (!definition.capabilities.includes(capabilityRaw)) continue
    const riskLevelRaw = typeof item.riskLevel === 'string' ? item.riskLevel.trim() : ''
    if (riskLevelRaw !== 'low' && riskLevelRaw !== 'medium' && riskLevelRaw !== 'high') continue
    const estimatedCostRaw =
      typeof item.estimatedCost === 'object' && item.estimatedCost !== null && !Array.isArray(item.estimatedCost)
        ? item.estimatedCost
        : {}
    const estimatedTokensRaw = (estimatedCostRaw as { tokens?: unknown }).tokens
    const estimatedLatencyRaw = (estimatedCostRaw as { latencyMs?: unknown }).latencyMs
    normalized.push({
      tool: toolRaw,
      capability: capabilityRaw,
      rationale:
        typeof item.rationale === 'string' && item.rationale.trim().length > 0
          ? item.rationale.trim()
          : 'No rationale provided.',
      expectedOutput:
        typeof item.expectedOutput === 'string' && item.expectedOutput.trim().length > 0
          ? item.expectedOutput.trim()
          : 'No expected output defined.',
      riskLevel: riskLevelRaw,
      estimatedCost: {
        tokens:
          typeof estimatedTokensRaw === 'number' && Number.isFinite(estimatedTokensRaw)
            ? Math.max(0, Math.floor(estimatedTokensRaw))
            : definition.estimatedCost.tokens,
        latencyMs:
          typeof estimatedLatencyRaw === 'number' && Number.isFinite(estimatedLatencyRaw)
            ? Math.max(0, Math.floor(estimatedLatencyRaw))
            : definition.estimatedCost.latencyMs
      },
      input:
        typeof item.input === 'object' && item.input !== null && !Array.isArray(item.input)
          ? item.input
          : {}
    })
    if (normalized.length >= 4) break
  }
  return normalized
}

function toToolCalls(actions: PlannedToolAction[]): ToolCall[] {
  return actions.map((action) => ({
    tool: action.tool as ToolName,
    input: action.input
  }))
}

function summarizeLoop(
  plan: StructuredExecutionPlan,
  loopRun: Awaited<ReturnType<typeof runAgentLoop>>
): string {
  const planned = plan.actions.length
  const executed = loopRun.usage.toolCalls
  const failures = loopRun.failures
  const lines: string[] = [
    `Planned actions: ${planned}`,
    `Executed tool calls: ${executed}`,
    `Failures: ${failures}`,
    `Loop stop reason: ${loopRun.stopReason}`
  ]
  if (loopRun.steps.length > 0) {
    lines.push(
      `Recent observations: ${loopRun.steps
        .slice(-3)
        .map((step) => `${step.selectedTool}:${step.observation}`)
        .join(' | ')}`
    )
  }
  return lines.join('\n')
}

async function verifyFindingsWithGate(
  findings: ParsedInquiry['findings'],
  paths: LabPaths,
  minConfidence: number,
  mode: EvidenceVerificationMode
): Promise<{
  verified: ParsedInquiry['findings']
  reviewQueue: ParsedInquiry['findings']
}> {
  const verified: ParsedInquiry['findings'] = []
  const reviewQueue: ParsedInquiry['findings'] = []
  for (const finding of findings) {
    const checkedEvidence = await verifyFindingEvidenceWithMode({
      claim: finding.claim,
      evidence: finding.evidence,
      paths,
      minConfidence,
      mode
    })
    const promotableEvidence = keepVerifiedEvidence(checkedEvidence)
    if (promotableEvidence.length > 0) {
      verified.push({
        ...finding,
        evidence: promotableEvidence
      })
      continue
    }
    reviewQueue.push({
      ...finding,
      status: 'unverified',
      evidence: checkedEvidence
    })
  }
  return { verified, reviewQueue }
}

type CriticalWriteGateMode = 'approved' | 'blocked' | 'bypassed'

interface CriticalWriteGateDecision {
  approved: boolean
  mode: CriticalWriteGateMode
  reason: string
}

export function resolveCriticalWriteGateDecision(input: {
  gateEnabled: boolean
  requireExplicitWriteApproval: boolean
  hasPersistActionPlanned: boolean
  orchestrationStopReason?: StopReason
}): CriticalWriteGateDecision {
  if (!input.gateEnabled) {
    return {
      approved: true,
      mode: 'bypassed',
      reason: 'critical_write_gate_disabled'
    }
  }
  if (!input.requireExplicitWriteApproval) {
    return {
      approved: true,
      mode: 'approved',
      reason: 'explicit_approval_not_required'
    }
  }
  const stopReason = input.orchestrationStopReason
  const approved = input.hasPersistActionPlanned && stopReason === 'goal_reached'
  if (approved) {
    return {
      approved: true,
      mode: 'approved',
      reason: 'persist_action_planned_and_goal_reached'
    }
  }
  return {
    approved: false,
    mode: 'blocked',
    reason: input.hasPersistActionPlanned
      ? `orchestration_stop_reason_${stopReason ?? 'unknown'}`
      : 'missing_explicit_persist_approval'
  }
}

export function buildNoProgressRecommendation(): string {
  return 'No-progress detectado: ajuste o plano (novas tools/entradas), reexecute inquiry ou rode deep-dive complementar antes de persistir conclusoes.'
}

async function writeInquiryDiagnosticArtifact(input: {
  paths: LabPaths
  slug: string
  gate: CriticalWriteGateDecision
  contract: InquiryContractResult
}): Promise<string> {
  const diagnosticPath = path.join(input.paths.leadsDir, `lead-${input.slug}.inquiry-diagnostics.md`)
  const lines = [
    '---',
    'type: inquiry_diagnostic',
    `lead_slug: "lead-${input.slug}"`,
    `created_at: "${new Date().toISOString()}"`,
    `critical_write_gate: "${input.gate.mode}"`,
    `gate_reason: "${input.gate.reason}"`,
    `needs_repair: ${input.contract.needsRepair ? 'true' : 'false'}`,
    `repair_reasons: [${input.contract.repairReasons.map((item) => `"${item}"`).join(', ')}]`,
    '---',
    '',
    '# Inquiry Diagnostic',
    '',
    `- Critical write gate: ${input.gate.mode}`,
    `- Gate reason: ${input.gate.reason}`,
    `- Needs repair: ${input.contract.needsRepair ? 'yes' : 'no'}`,
    `- Repair reasons: ${input.contract.repairReasons.length > 0 ? input.contract.repairReasons.join(', ') : 'none'}`,
    ''
  ]
  await writeUtf8(diagnosticPath, lines.join('\n'))
  return diagnosticPath
}

function resolveFinalStopReason(
  parsed: ParsedInquiry,
  orchestrationStopReason: StopReason | undefined,
  confidenceThreshold: number
): StopReason {
  if (parsed.confidence < confidenceThreshold) return 'low_confidence'
  if (orchestrationStopReason) return orchestrationStopReason
  if (parsed.scenario === 'positive') return 'goal_reached'
  if (parsed.scenario === 'plan_another_inquiry') return 'insufficient_evidence'
  return 'insufficient_evidence'
}

function createCompliancePolicy(defaultDecision: ComplianceDecision): {
  defaultDecision: ComplianceDecision
  byRisk: { high: 'warn' }
  byCapability: { persist: 'warn' }
} {
  return {
    defaultDecision,
    byRisk: {
      high: 'warn'
    },
    byCapability: {
      persist: 'warn'
    }
  } as const
}

function renderDomainSubagentContext(outputs: DomainSubagentResult[]): string {
  if (outputs.length === 0) return ''
  return `Domain subagents: ${outputs.map((item) => `${item.domain}:${item.ok ? 'ok' : 'fail'}`).join(' | ')}`
}

function executeDefaultDomainSubagent(plan: DomainSubagentPlan): DomainSubagentResult {
  const summary = `Read-only review for ${plan.domain} generated with bounded context.`
  return {
    domain: plan.domain,
    ok: true,
    summary,
    evidence: [],
    warnings: []
  }
}

function buildInquiryGovernanceTargets(input: {
  slug: string
  allegations: Array<{ id: string }>
  findings: Array<{ id: string }>
  reviewQueue: Array<{ id: string }>
}): Array<{
  artifactType: 'lead' | 'allegation' | 'finding' | 'evidence_review_queue'
  artifactId: string
}> {
  return [
    {
      artifactType: 'lead' as const,
      artifactId: `lead-${input.slug}`
    },
    ...input.allegations.map((item) => ({
      artifactType: 'allegation' as const,
      artifactId: item.id
    })),
    ...input.findings.map((item) => ({
      artifactType: 'finding' as const,
      artifactId: item.id
    })),
    ...input.reviewQueue.map((item) => ({
      artifactType: 'evidence_review_queue' as const,
      artifactId: item.id
    }))
  ]
}

function defaultConclusion(scenario: InquiryScenario): string {
  if (scenario === 'positive') {
    return 'This inquiry found enough allegations and findings to support the case with good confidence.'
  }
  if (scenario === 'plan_another_inquiry') {
    return 'This inquiry produced a partial base. A new inquiry with a complementary strategy is recommended to expand coverage and validate hypotheses.'
  }
  return 'This inquiry did not find conclusive allegations/findings with the available source material in this round.'
}

async function buildInquirySourceSummary(sourceArtifactsDir: string, sourceDir: string): Promise<string> {
  const { previews } = await loadPreviewsIncremental(sourceArtifactsDir, sourceDir)
  if (previews.length === 0) return '(Nenhum preview disponivel)'
  return previews
    .slice(0, 10)
    .map((preview, idx) => {
      const excerpt = limitText(preview.content.replace(/\s+/g, ' ').trim(), 1200)
      return `## Source ${idx + 1}: ${preview.documentName} (${preview.docId})\n${excerpt}`
    })
    .join('\n\n')
}
