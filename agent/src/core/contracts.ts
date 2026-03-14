export type ChatMode = 'question' | 'planning' | 'agent'

export type VerificationStatus = 'unverified' | 'verified' | 'rejected'
export type EvidenceVerificationStatus = 'verified' | 'weak' | 'missing'
export type DossierEntityType = 'person' | 'group' | 'place'
export type GroupCategory =
  | 'company'
  | 'government'
  | 'political_party'
  | 'criminal_org'
  | 'foundation'
  | 'consortium'
  | 'team'
  | 'other'

export interface SourceRef {
  source: string
  page?: number
  highlight?: string
}

export interface Annotation {
  id: string
  text: string
  sourceRef: SourceRef
  status: VerificationStatus
  createdAt: string
}

export interface Clue {
  id: string
  investigationSlug: string
  lineSlug?: string
  text: string
  sourceRef: SourceRef
  status: VerificationStatus
  createdAt: string
}

export interface InvestigationLine {
  slug: string
  title: string
  objective: string
  hypothesis?: string
  relatedContracts?: string[]
  createdAt: string
}

export interface Investigation {
  slug: string
  title: string
  question: string
  description: string
  hypothesis: string
  checklist: string[]
  relatedContracts?: string[]
  status: 'open' | 'closed'
  createdAt: string
}

export interface InquiryPlan {
  formulateAllegations: string[]
  defineSearchStrategy: string[]
  gatherFindings: string[]
  mapToAllegations: string[]
}

export interface AllegationItem {
  id: string
  statement: string
  leadSlug: string
  findingIds: string[]
}

export interface FindingEvidence {
  source_id: string
  excerpt: string
  location: EvidenceLocation
  confidence: number
  verification_status: EvidenceVerificationStatus
  verification_notes?: string[]
  // Legacy aliases kept for backward compatibility during migration.
  source: string
  page?: number
}

export interface PdfEvidenceLocation {
  kind: 'pdf'
  page?: number
  block?: string
  startOffset?: number
  endOffset?: number
  bbox?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface TextEvidenceLocation {
  kind: 'text'
  lineStart?: number
  lineEnd?: number
  block?: string
  startOffset?: number
  endOffset?: number
}

export interface UnknownEvidenceLocation {
  kind: 'unknown'
  hint?: string
}

export type EvidenceLocation =
  | PdfEvidenceLocation
  | TextEvidenceLocation
  | UnknownEvidenceLocation

export interface FindingItem {
  id: string
  claim: string
  evidence: FindingEvidence[]
  status: VerificationStatus
  leadSlug: string
  allegationIds: string[]
}

export type InquiryScenario = 'positive' | 'negative' | 'plan_another_inquiry'

export interface DossierEntityBase {
  type: DossierEntityType
  name: string
  slug: string
  summary: string
  tags: string[]
  createdAt: string
  updatedAt: string
  firstSeenIn?: string
}

export interface PersonEntity extends DossierEntityBase {
  type: 'person'
  aliases?: string[]
  category?: string
}

export interface GroupEntity extends DossierEntityBase {
  type: 'group'
  category: GroupCategory
  registrationId?: string
  members?: string[]
}

export interface PlaceEntity extends DossierEntityBase {
  type: 'place'
  country?: string
  city?: string
  neighborhood?: string
  address?: string
  coordinates?: [number, number]
}

export type DossierEntity = PersonEntity | GroupEntity | PlaceEntity

export interface TimelineEvent {
  date: string
  actors: string[]
  eventType: string
  source: string
  description: string
  follows?: string
}

export interface ContractParty {
  name: string
  role?: string
}

export interface CompanyExtraction {
  name: string
  owners?: string[]
  registrationId?: string
  address?: string
  contact?: string
  bdiDiscount?: string
}

export interface ContractExtraction {
  contractId: string
  sourceFile: string
  workName: string
  workDescription: string
  location?: string
  urgencyReason?: string
  totalValue?: string
  peopleInvolved: ContractParty[]
  companies: CompanyExtraction[]
  bdiTable: Array<{ company: string; bdi: string }>
  winningCompany?: string
  winnerReason?: string
}

export interface InvestigationInsight {
  title: string
  description: string
  relatedContracts: string[]
}

export interface InvestigationLineDraft {
  title: string
  question: string
  objective: string
  hypothesis?: string
  relatedContracts: string[]
}

export interface LineDataPoint {
  fact: string
  source: string
  page?: number
  highlight?: string
  relatedContracts?: string[]
}

export interface LineConclusion {
  lineTitle: string
  summary: string
  confidence: 'baixa' | 'media' | 'alta'
  evidenceRefs: string[]
}

export interface InputDocument {
  id: string
  fileName: string
  absolutePath: string
  content: string
}

export interface PlanningResult {
  strategyMarkdown: string
  strategyPath: string
  highlights: string[]
}

export interface InvestigationExecutionResult {
  investigationSlug: string
  investigationPath: string
  linesCreated: string[]
  cluesCreated: string[]
  annotationsCreated: string[]
  dossierPath: string
  conclusionsPath: string
}

export interface EvaluationScore {
  score: number
  passed: boolean
  breakdown: Record<string, number>
  notes: string[]
}

// ─── Standard Process types ───────────────────────────────────────────────

export type NoteCategory = 'CLAIM' | 'RED_FLAG' | 'DISCREPANCY'
export type NoteStatus = 'unverified' | 'verified' | 'rejected'

export interface NoteItem {
  category: NoteCategory
  source: string
  page: number
  highlight: string
  description: string
  tags: string[]
  status: NoteStatus
  createdAt: string
}

export interface PersonExtraction {
  type: 'person'
  name: string
  aliases: string[]
  category: string
  role_in_document: string
  why_relevant: string
  first_seen_in: string
  pages_mentioned: number[]
  tags: string[]
  summary: string
}

export interface GroupExtraction {
  type: 'group'
  name: string
  category: GroupCategory
  registration_id: string | null
  members: string[]
  role_in_document: string
  why_relevant: string
  first_seen_in: string
  pages_mentioned: number[]
  tags: string[]
  summary: string
}

export interface PlaceExtraction {
  type: 'place'
  name: string
  country: string
  city: string
  neighborhood: string | null
  address: string | null
  coordinates: null
  context: string
  first_seen_in: string
  pages_mentioned: number[]
  tags: string[]
}

export interface EventExtraction {
  type: 'event'
  date: string
  title: string
  actors: string[]
  event_type: string
  source: string
  page: number
  description: string
  follows: string | null
  tags: string[]
}

