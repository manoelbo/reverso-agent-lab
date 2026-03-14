import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { FindingEvidence } from './contracts.js'
import { detectLanguageFromText, type LanguageCode } from './language.js'
import type { LabPaths } from './paths.js'
import {
  validateEditorialGovernanceTargets,
  type EditorialGovernanceTarget,
  type GovernanceValidationMode
} from './editorial-governance.js'

interface AllegationLike {
  id: string
  statement: string
}

interface FindingLike {
  id: string
  claim: string
  supportsAllegationIds: string[]
  evidence: FindingEvidence[]
}

export interface InquiryPreWriteValidationInput {
  slug: string
  allegations: AllegationLike[]
  findings: FindingLike[]
  reviewQueue: FindingLike[]
  expectedLanguage?: LanguageCode
  editorialGovernanceTargets?: EditorialGovernanceTarget[]
  editorialGovernanceMode?: GovernanceValidationMode
  paths: LabPaths
}

export interface PreWriteValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

function isEvidenceLocationValid(evidence: FindingEvidence): boolean {
  const location = evidence.location
  if (location.kind === 'pdf') return true
  if (location.kind === 'text') return true
  return location.kind === 'unknown'
}

async function loadKnownSourceIds(paths: LabPaths): Promise<Set<string>> {
  const checkpointPath = path.join(paths.sourceDir, 'source-checkpoint.json')
  try {
    const raw = await readFile(checkpointPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      files?: Array<{
        docId?: string
        originalFileName?: string
      }>
    }
    const ids = new Set<string>()
    for (const item of parsed.files ?? []) {
      if (typeof item.docId === 'string' && item.docId.trim().length > 0) ids.add(item.docId.trim())
      if (typeof item.originalFileName === 'string' && item.originalFileName.trim().length > 0) {
        ids.add(item.originalFileName.trim())
      }
    }
    return ids
  } catch {
    return new Set<string>()
  }
}

export async function validateInquiryPreWrite(
  input: InquiryPreWriteValidationInput
): Promise<PreWriteValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const allegationSet = new Set<string>()
  for (const allegation of input.allegations) {
    const id = allegation.id.trim()
    if (!id) {
      errors.push('Allegation com id vazio.')
      continue
    }
    if (allegationSet.has(id)) errors.push(`Allegation duplicada: ${id}`)
    allegationSet.add(id)
    if (!allegation.statement.trim()) errors.push(`Allegation sem statement: ${id}`)
  }

  const findings = [...input.findings, ...input.reviewQueue]
  const findingSet = new Set<string>()
  for (const finding of findings) {
    const id = finding.id.trim()
    if (!id) {
      errors.push('Finding com id vazio.')
      continue
    }
    if (findingSet.has(id)) errors.push(`Finding duplicado: ${id}`)
    findingSet.add(id)
    if (!finding.claim.trim()) errors.push(`Finding sem claim: ${id}`)
    for (const allegationId of finding.supportsAllegationIds) {
      if (!allegationSet.has(allegationId)) {
        errors.push(`Finding ${id} referencia allegation inexistente: ${allegationId}`)
      }
    }
    for (const evidence of finding.evidence) {
      if (!evidence.source_id.trim()) errors.push(`Evidence sem source_id em finding ${id}`)
      if (!evidence.excerpt.trim()) errors.push(`Evidence sem excerpt em finding ${id}`)
      if (!isEvidenceLocationValid(evidence)) {
        errors.push(`Evidence com location invalida em finding ${id}`)
      }
      if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
        errors.push(`Evidence com confidence fora do intervalo 0..1 em finding ${id}`)
      }
    }
  }

  const knownSourceIds = await loadKnownSourceIds(input.paths)
  if (knownSourceIds.size > 0) {
    for (const finding of findings) {
      for (const evidence of finding.evidence) {
        if (!knownSourceIds.has(evidence.source_id)) {
          warnings.push(`Evidence source_id não encontrado no checkpoint: ${evidence.source_id}`)
        }
      }
    }
  } else {
    warnings.push('source-checkpoint indisponível; validação de referências de source_id parcial.')
  }

  if (input.expectedLanguage) {
    const corpus = [
      ...input.allegations.map((item) => item.statement),
      ...findings.map((item) => item.claim)
    ]
      .join('\n')
      .trim()
    const detected = detectLanguageFromText(corpus)
    if (detected && detected !== input.expectedLanguage) {
      warnings.push(
        `Possível inconsistência de idioma: esperado=${input.expectedLanguage}, detectado=${detected}.`
      )
    }
  }

  const governanceMode = input.editorialGovernanceMode ?? 'off'
  if (governanceMode !== 'off') {
    const governanceResult = validateEditorialGovernanceTargets(
      input.editorialGovernanceTargets ?? [],
      governanceMode
    )
    warnings.push(...governanceResult.warnings)
    if (!governanceResult.ok) {
      errors.push(...governanceResult.errors)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings
  }
}

