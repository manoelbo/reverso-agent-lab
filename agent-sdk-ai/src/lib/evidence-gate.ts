import type { InquiryEvidence, InquiryFinding } from './contracts'

export interface EvidenceGateOptions {
  minConfidence: number
  acceptedStatuses?: Array<'verified' | 'weak' | 'missing'>
}

export interface EvidenceGateResult {
  verified: InquiryFinding[]
  reviewQueue: InquiryFinding[]
}

export function keepVerifiedEvidence(
  evidence: InquiryEvidence[],
  options: EvidenceGateOptions
): InquiryEvidence[] {
  const acceptedStatuses = options.acceptedStatuses ?? ['verified']
  return evidence.filter(
    (item) =>
      item.confidence >= options.minConfidence &&
      acceptedStatuses.includes(item.verification_status)
  )
}

export function applyEvidenceGate(
  findings: InquiryFinding[],
  options: EvidenceGateOptions
): EvidenceGateResult {
  const verified: InquiryFinding[] = []
  const reviewQueue: InquiryFinding[] = []

  for (const finding of findings) {
    const evidence = keepVerifiedEvidence(finding.evidence, options)
    if (evidence.length > 0) {
      verified.push({
        ...finding,
        evidence,
      })
      continue
    }

    reviewQueue.push({
      ...finding,
      status: 'unverified',
    })
  }

  return { verified, reviewQueue }
}
