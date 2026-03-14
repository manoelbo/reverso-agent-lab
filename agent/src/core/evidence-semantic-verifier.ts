import type { FindingEvidence } from './contracts.js'
import type { LabPaths } from './paths.js'
import { verifyEvidenceItem } from './evidence-verifier.js'

export type EvidenceVerificationMode = 'lexical' | 'semantic' | 'hybrid'

export interface SemanticScoreResult {
  score: number
  rationale?: string
}

export type SemanticScoreProvider = (input: {
  claim: string
  evidence: FindingEvidence
  paths: LabPaths
}) => Promise<SemanticScoreResult>

export interface VerifiableEvidence extends FindingEvidence {
  semantic_score?: number
  verification_rationale?: string
}

export async function verifyEvidenceItemWithMode(input: {
  claim: string
  evidence: FindingEvidence
  paths: LabPaths
  minConfidence: number
  mode: EvidenceVerificationMode
  semanticProvider?: SemanticScoreProvider
}): Promise<VerifiableEvidence> {
  const lexical = await verifyEvidenceItem({
    evidence: input.evidence,
    paths: input.paths,
    minConfidence: input.minConfidence
  })
  if (input.mode === 'lexical') return lexical

  const provider = input.semanticProvider ?? defaultSemanticScoreProvider
  const semantic = await provider({
    claim: input.claim,
    evidence: lexical,
    paths: input.paths
  })
  const semanticScore = clamp01(semantic.score)
  if (input.mode === 'semantic') {
    const semanticStatus: FindingEvidence['verification_status'] =
      semanticScore >= input.minConfidence
        ? 'verified'
        : semanticScore >= Math.max(0.2, input.minConfidence - 0.2)
          ? 'weak'
          : 'missing'
    return {
      ...lexical,
      confidence: semanticScore,
      verification_status: semanticStatus,
      semantic_score: semanticScore,
      verification_rationale:
        semantic.rationale ?? `semantic_score=${semanticScore.toFixed(2)} mode=semantic`
    }
  }

  const hybridScore = clamp01((lexical.confidence + semanticScore) / 2)
  const hybridStatus: FindingEvidence['verification_status'] =
    lexical.verification_status === 'missing' && semanticScore < input.minConfidence
      ? 'missing'
      : hybridScore >= input.minConfidence
        ? 'verified'
        : 'weak'
  return {
    ...lexical,
    confidence: hybridScore,
    verification_status: hybridStatus,
    semantic_score: semanticScore,
    verification_rationale:
      semantic.rationale ??
      `hybrid lexical=${lexical.confidence.toFixed(2)} semantic=${semanticScore.toFixed(2)}`
  }
}

export async function verifyFindingEvidenceWithMode(input: {
  claim: string
  evidence: FindingEvidence[]
  paths: LabPaths
  minConfidence: number
  mode: EvidenceVerificationMode
  semanticProvider?: SemanticScoreProvider
}): Promise<VerifiableEvidence[]> {
  return Promise.all(
    input.evidence.map((item) =>
      verifyEvidenceItemWithMode({
        claim: input.claim,
        evidence: item,
        paths: input.paths,
        minConfidence: input.minConfidence,
        mode: input.mode,
        ...(input.semanticProvider ? { semanticProvider: input.semanticProvider } : {})
      })
    )
  )
}

export async function defaultSemanticScoreProvider(input: {
  claim: string
  evidence: FindingEvidence
}): Promise<SemanticScoreResult> {
  const claimTokens = tokenize(input.claim)
  const evidenceTokens = tokenize(input.evidence.excerpt)
  if (claimTokens.size === 0 || evidenceTokens.size === 0) {
    return { score: 0, rationale: 'semantic_provider:insufficient_tokens' }
  }
  let shared = 0
  for (const token of claimTokens) {
    if (evidenceTokens.has(token)) shared += 1
  }
  const score = shared / Math.max(1, Math.min(claimTokens.size, evidenceTokens.size))
  return {
    score: clamp01(score),
    rationale: `semantic_overlap=${shared}/${Math.max(1, Math.min(claimTokens.size, evidenceTokens.size))}`
  }
}

function tokenize(value: string): Set<string> {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)
  return new Set(normalized)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
