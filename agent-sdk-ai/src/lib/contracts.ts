import { z } from 'zod'

export const inquiryPlanSchema = z.object({
  formulateAllegations: z.array(z.string().min(1)).min(1),
  defineSearchStrategy: z.array(z.string().min(1)).min(1),
  gatherFindings: z.array(z.string().min(1)).min(1),
  mapToAllegations: z.array(z.string().min(1)).min(1),
})

export const createLeadPayloadSchema = z.object({
  codename: z.string().min(2),
  title: z.string().min(3),
  description: z.string().min(10),
  inquiryPlan: inquiryPlanSchema,
})

export const inquiryPlanActionSchema = z.object({
  tool: z.string().min(2),
  capability: z.enum(['read', 'extract', 'crosscheck', 'persist']),
  rationale: z.string().min(6),
  expectedOutput: z.string().min(3),
  riskLevel: z.enum(['low', 'medium', 'high']),
  estimatedCost: z.object({
    tokens: z.number().int().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  }),
  input: z.record(z.string(), z.unknown()),
})

export const inquiryExecutionPlanSchema = z.object({
  objective: z.string().min(3),
  hypotheses: z.array(z.string().min(1)).min(1),
  actions: z.array(inquiryPlanActionSchema).min(1),
  successCriteria: z.array(z.string().min(1)).min(1),
  stopCriteria: z.array(z.string().min(1)).min(1),
  confidenceTarget: z.number().min(0).max(1),
})

export const evidenceLocationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pdf'),
    page: z.number().int().positive().optional(),
    block: z.string().optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('text'),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    block: z.string().optional(),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal('unknown'),
    hint: z.string().optional(),
  }),
])

export const inquiryEvidenceSchema = z.object({
  source_id: z.string().min(1),
  source: z.string().min(1),
  excerpt: z.string().min(1),
  location: evidenceLocationSchema,
  confidence: z.number().min(0).max(1),
  verification_status: z.enum(['verified', 'weak', 'missing']),
  verification_notes: z.array(z.string().min(1)).optional(),
  page: z.number().int().positive().optional(),
})

export const inquiryFinalFindingSchema = z.object({
  id: z.string().min(1),
  claim: z.string().min(3),
  status: z.enum(['verified', 'rejected', 'unverified']),
  supportsAllegationIds: z.array(z.string().min(1)).min(1),
  evidence: z.array(inquiryEvidenceSchema).min(1),
})

export const inquiryFinalPayloadSchema = z.object({
  scenario: z.enum(['positive', 'negative', 'plan_another_inquiry']),
  confidence: z.number().min(0).max(1),
  conclusion: z.string().min(4),
  allegations: z.array(
    z.object({
      id: z.string().min(1),
      statement: z.string().min(3),
    })
  ),
  findings: z.array(inquiryFinalFindingSchema),
})

export type InquiryPlan = z.infer<typeof inquiryPlanSchema>
export type CreateLeadPayload = z.infer<typeof createLeadPayloadSchema>
export type InquiryExecutionPlan = z.infer<typeof inquiryExecutionPlanSchema>
export type InquiryFinalPayload = z.infer<typeof inquiryFinalPayloadSchema>
export type InquiryFinding = z.infer<typeof inquiryFinalFindingSchema>
export type InquiryEvidence = z.infer<typeof inquiryEvidenceSchema>

export function parseStrictJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    throw new Error('JSON inválido: conteúdo deve iniciar com "{" ou "[".')
  }
  return JSON.parse(cleaned)
}
