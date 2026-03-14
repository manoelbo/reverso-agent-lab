import type { FindingEvidence } from './contracts.js'
import type { LabPaths } from './paths.js'
import { resolveEvidenceLocation } from './evidence-locator.js'

export interface VerifyEvidenceInput {
  evidence: FindingEvidence
  paths: LabPaths
  minConfidence: number
}

export async function verifyEvidenceItem(input: VerifyEvidenceInput): Promise<FindingEvidence> {
  const sourceId = (input.evidence.source_id ?? input.evidence.source ?? '').trim()
  const excerpt = (input.evidence.excerpt ?? '').trim()
  const notes: string[] = [...(input.evidence.verification_notes ?? [])]
  if (!sourceId || !excerpt) {
    if (!sourceId) notes.push('Missing source_id.')
    if (!excerpt) notes.push('Missing excerpt.')
    return {
      ...input.evidence,
      source_id: sourceId,
      source: sourceId,
      excerpt,
      location: { kind: 'unknown', hint: 'incomplete_evidence' },
      confidence: 0,
      verification_status: 'missing',
      verification_notes: notes
    }
  }

  const resolved = await resolveEvidenceLocation({
    paths: input.paths,
    sourceId,
    excerpt,
    ...(typeof input.evidence.page === 'number' ? { fallbackPage: input.evidence.page } : {})
  })
  notes.push(...resolved.notes)

  const baseConfidence = typeof input.evidence.confidence === 'number' ? input.evidence.confidence : 0.5
  const confidence = clamp01((baseConfidence + resolved.score) / 2)
  let verification_status: FindingEvidence['verification_status']

  if (!resolved.matched) {
    verification_status = 'missing'
  } else if (resolved.ambiguous || confidence < input.minConfidence) {
    verification_status = 'weak'
  } else {
    verification_status = 'verified'
  }

  const page = resolved.location.kind === 'pdf' ? resolved.location.page : undefined
  return {
    ...input.evidence,
    source_id: resolved.source_id,
    source: resolved.source_id,
    excerpt,
    location: resolved.location,
    confidence,
    verification_status,
    ...(typeof page === 'number' ? { page } : {}),
    ...(notes.length ? { verification_notes: dedupe(notes) } : {})
  }
}

export function keepVerifiedEvidence(evidence: FindingEvidence[]): FindingEvidence[] {
  return evidence.filter((item) => item.verification_status === 'verified')
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function dedupe(list: string[]): string[] {
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean)))
}
