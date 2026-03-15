import { tool } from 'ai'
import { z } from 'zod'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput, parseToolContext, requiresApproval } from './helpers'
import { inquiryFinalPayloadSchema } from '@/lib/contracts'
import { validateWithSelfRepair } from '@/lib/self-repair'
import { applyEvidenceGate } from '@/lib/evidence-gate'
import { resolveCriticalWriteGateDecision } from '@/lib/critical-write-gate'

function extractJsonCandidate(text: string): string | undefined {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) return undefined
  return text.slice(firstBrace, lastBrace + 1)
}

export const runInquiryTool = tool({
  description:
    'Executa inquiry PEV para um lead específico e persiste allegations/findings/conclusão.',
  inputSchema: z.object({
    lead: z
      .string()
      .min(2)
      .max(180)
      .describe('Slug do lead, com ou sem prefixo lead-.'),
  }),
  needsApproval: async (_input, options) => {
    return requiresApproval(options.experimental_context)
  },
  execute: async ({ lead }, options) => {
    const context = parseToolContext(options.experimental_context)
    const normalized = lead.replace(/^lead-/, '').replace(/\.md$/i, '')
    const result = await runLegacyCommand(['inquiry', '--lead', normalized])

    const jsonCandidate = extractJsonCandidate(result.stdout)
    let evidenceGate: {
      verifiedFindings: number
      reviewQueue: number
      scenario?: string
      confidence?: number
    } | null = null

    if (jsonCandidate) {
      const validated = await validateWithSelfRepair({
        raw: jsonCandidate,
        schema: inquiryFinalPayloadSchema,
        contractName: 'inquiry.final',
        maxAttempts: 1,
      })

      if (validated.ok && validated.value) {
        const gate = applyEvidenceGate(validated.value.findings, {
          minConfidence: 0.6,
          acceptedStatuses: ['verified', 'weak'],
        })
        evidenceGate = {
          verifiedFindings: gate.verified.length,
          reviewQueue: gate.reviewQueue.length,
          scenario: validated.value.scenario,
          confidence: validated.value.confidence,
        }
      }
    }

    const criticalWriteGate = resolveCriticalWriteGateDecision({
      gateEnabled: true,
      requireExplicitWriteApproval: context.autoAccept !== true,
      hasPersistActionPlanned: true,
      orchestrationStopReason:
        evidenceGate && evidenceGate.verifiedFindings > 0
          ? 'goal_reached'
          : 'insufficient_evidence',
    })

    return {
      ok: true,
      lead: normalized,
      stdout: compactOutput(result.stdout, 2600),
      elapsedMs: result.elapsedMs,
      evidenceGate,
      criticalWriteGate,
    }
  },
})
