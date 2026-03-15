// ─── Core types ported from agent/src/core/contracts.ts ─────────────────────

export type VerificationStatus = 'unverified' | 'verified' | 'rejected';
export type EvidenceVerificationStatus = 'verified' | 'weak' | 'missing';
export type InquiryScenario = 'positive' | 'negative' | 'plan_another_inquiry';

export interface FindingEvidence {
  source_id: string;
  source: string;
  excerpt: string;
  location?: { kind: string; page?: number; hint?: string };
  confidence: number;
  verification_status: EvidenceVerificationStatus;
  page?: number;
  verification_notes?: string[];
}

export interface InquiryPlan {
  formulateAllegations: string[];
  defineSearchStrategy: string[];
  gatherFindings: string[];
  mapToAllegations: string[];
}

export interface LeadAllegation {
  id: string;
  statement: string;
}

export interface LeadFinding {
  id: string;
  claim: string;
  status: VerificationStatus;
  supportsAllegationIds: string[];
  evidence: FindingEvidence[];
}
