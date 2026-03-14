export type EditorialStatus = 'draft' | 'in_review' | 'approved' | 'published'
export type GovernanceValidationMode = 'off' | 'soft' | 'strict'

export interface EditorialGovernanceMetadata {
  approver: string
  approved_at: string
  editorial_status: EditorialStatus
  publication_criteria: string[]
  legal_notes: string
}

export interface EditorialGovernanceTarget {
  artifactType: 'lead' | 'allegation' | 'finding' | 'evidence_review_queue'
  artifactId: string
  governance?: Partial<EditorialGovernanceMetadata>
}

export interface EditorialGovernanceValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export function createDefaultEditorialGovernance(
  input?: Partial<EditorialGovernanceMetadata>
): EditorialGovernanceMetadata {
  return {
    approver: input?.approver?.trim() ?? '',
    approved_at: input?.approved_at?.trim() ?? '',
    editorial_status: normalizeEditorialStatus(input?.editorial_status),
    publication_criteria: normalizePublicationCriteria(input?.publication_criteria),
    legal_notes: input?.legal_notes?.trim() ?? ''
  }
}

export function validateEditorialGovernanceTargets(
  targets: EditorialGovernanceTarget[],
  mode: GovernanceValidationMode
): EditorialGovernanceValidationResult {
  if (mode === 'off') {
    return { ok: true, errors: [], warnings: [] }
  }
  const warnings: string[] = []
  const errors: string[] = []
  for (const target of targets) {
    const governance = createDefaultEditorialGovernance(target.governance)
    const id = `${target.artifactType}:${target.artifactId}`
    if (!target.governance) {
      warnings.push(`${id} sem governanca editorial explicita; aplicando defaults de migracao.`)
    }
    if ((governance.editorial_status === 'approved' || governance.editorial_status === 'published') && !governance.approver) {
      errors.push(`${id} exige approver quando status=${governance.editorial_status}.`)
    }
    if (governance.approved_at && Number.isNaN(Date.parse(governance.approved_at))) {
      errors.push(`${id} possui approved_at invalido.`)
    }
    if (
      (governance.editorial_status === 'approved' || governance.editorial_status === 'published') &&
      !governance.approved_at
    ) {
      errors.push(`${id} exige approved_at quando status=${governance.editorial_status}.`)
    }
    if (governance.editorial_status === 'published' && governance.publication_criteria.length === 0) {
      errors.push(`${id} exige publication_criteria para status=published.`)
    }
  }
  if (mode === 'soft') {
    return { ok: true, errors: [], warnings: [...warnings, ...errors] }
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings
  }
}

function normalizeEditorialStatus(value: unknown): EditorialStatus {
  if (value === 'draft' || value === 'in_review' || value === 'approved' || value === 'published') {
    return value
  }
  return 'draft'
}

function normalizePublicationCriteria(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
