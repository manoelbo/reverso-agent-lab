import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type {
  FindingEvidence,
  InquiryPlan,
  InquiryScenario,
  VerificationStatus
} from '../../core/contracts.js'
import {
  createDefaultEditorialGovernance,
  type EditorialGovernanceMetadata
} from '../../core/editorial-governance.js'
import { ensureDir, slugify, writeUtf8 } from '../../core/fs-io.js'
import { formatFrontmatter } from '../../core/markdown.js'
import type { ToolContext } from './context.js'

export interface LeadAllegationInput {
  id: string
  statement: string
}

export interface LeadFindingInput {
  id: string
  claim: string
  evidence: FindingEvidence[]
  status: VerificationStatus
  supportsAllegationIds: string[]
}

export interface CreateLeadFileInput {
  slug: string
  title: string
  description: string
  language?: string
  inquiryPlan?: InquiryPlan
  status?: 'draft' | 'planned'
  allegations?: LeadAllegationInput[]
  findings?: LeadFindingInput[]
}

export interface CreateLeadFileOutput {
  leadPath: string
  allegationPaths: string[]
  findingPaths: string[]
}

export interface AppendLeadConclusionInput {
  slug: string
  scenario: InquiryScenario
  conclusion: string
  language?: string
  audit?: InquiryAuditMetadata
  governance?: Partial<EditorialGovernanceMetadata>
}

export interface PersistInquiryArtifactsInput {
  slug: string
  allegations: LeadAllegationInput[]
  findings: LeadFindingInput[]
  reviewQueue?: LeadFindingInput[]
  language?: string
  audit?: InquiryAuditMetadata
  governance?: Partial<EditorialGovernanceMetadata>
}

export interface InquiryAuditMetadata {
  criticalWriteGate: 'approved' | 'blocked' | 'bypassed'
  needsRepair: boolean
  repairReasons?: string[]
}

function normalizeAllegationId(raw: string, idx: number): string {
  const base = slugify(raw || `allegation-${idx + 1}`) || `allegation-${idx + 1}`
  return base.startsWith('allegation-') ? base : `allegation-${base}`
}

function normalizeFindingId(raw: string, idx: number): string {
  const base = slugify(raw || `finding-${idx + 1}`) || `finding-${idx + 1}`
  return base.startsWith('finding-') ? base : `finding-${base}`
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    result.push(item)
  }
  return result
}

function renderInquiryPlanSection(inquiryPlan: InquiryPlan): string {
  return [
    '## Inquiry Plan',
    '',
    '### 1. Formulate Allegations',
    ...inquiryPlan.formulateAllegations.map((item) => `- ${item}`),
    '',
    '### 2. Define Search Strategy',
    ...inquiryPlan.defineSearchStrategy.map((item) => `- ${item}`),
    '',
    '### 3. Gather Findings',
    ...inquiryPlan.gatherFindings.map((item) => `- ${item}`),
    '',
    '### 4. Map to Allegations',
    ...inquiryPlan.mapToAllegations.map((item) => `- ${item}`)
  ].join('\n')
}

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  if (!content.startsWith('---\n')) {
    return { frontmatter: {}, body: content }
  }
  const end = content.indexOf('\n---\n', 4)
  if (end === -1) {
    return { frontmatter: {}, body: content }
  }
  const raw = content.slice(4, end).split('\n')
  const frontmatter: Record<string, string> = {}
  for (const line of raw) {
    const sep = line.indexOf(':')
    if (sep <= 0) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim().replace(/^"|"$/g, '')
    if (!key) continue
    frontmatter[key] = value
  }
  return {
    frontmatter,
    body: content.slice(end + '\n---\n'.length)
  }
}

function getLeadLabels(language?: string): {
  contextTitle: string
  allegationsIndexTitle: string
  findingsIndexTitle: string
  fillLaterText: string
  linkedFindingsTitle: string
  noLinkedFindings: string
  statusLabel: string
  evidenceTitle: string
  evidenceMissing: string
  evidenceReviewQueueTitle: string
  evidenceReviewQueueEmpty: string
  relatedAllegationsTitle: string
  noRelatedAllegations: string
  conclusionTitle: string
  scenarioPositive: string
  scenarioNegative: string
  scenarioPlanAnother: string
} {
  if (language === 'pt') {
    return {
      contextTitle: 'Contexto',
      allegationsIndexTitle: 'Índice de Allegations',
      findingsIndexTitle: 'Índice de Findings',
      fillLaterText: '(preenchido depois por /inquiry)',
      linkedFindingsTitle: 'Findings vinculados',
      noLinkedFindings: 'nenhum finding vinculado',
      statusLabel: 'Status',
      evidenceTitle: 'Evidências',
      evidenceMissing: 'não informado',
      evidenceReviewQueueTitle: 'Fila de revisão de evidências',
      evidenceReviewQueueEmpty: 'sem pendências de revisão',
      relatedAllegationsTitle: 'Allegations relacionadas',
      noRelatedAllegations: 'nenhuma allegation relacionada',
      conclusionTitle: 'Conclusão',
      scenarioPositive: 'Cenário 1 (Positivo)',
      scenarioNegative: 'Cenário 2 (Negativo)',
      scenarioPlanAnother: 'Cenário 3 (Planejar nova inquiry)'
    }
  }
  return {
    contextTitle: 'Context',
    allegationsIndexTitle: 'Allegations Index',
    findingsIndexTitle: 'Findings Index',
    fillLaterText: '(filled later by /inquiry)',
    linkedFindingsTitle: 'Linked findings',
    noLinkedFindings: 'no linked findings',
    statusLabel: 'Status',
    evidenceTitle: 'Evidence',
    evidenceMissing: 'not provided',
    evidenceReviewQueueTitle: 'Evidence review queue',
    evidenceReviewQueueEmpty: 'no review backlog',
    relatedAllegationsTitle: 'Related allegations',
    noRelatedAllegations: 'no related allegations',
    conclusionTitle: 'Conclusion',
    scenarioPositive: 'Scenario 1 (Positive)',
    scenarioNegative: 'Scenario 2 (Negative)',
    scenarioPlanAnother: 'Scenario 3 (Plan Another Inquiry)'
  }
}

function statusSummary(
  findings: Array<{ status: VerificationStatus; allegationIds: string[] }>,
  allegationId: string
): string {
  const list = findings.filter((f) => f.allegationIds.includes(allegationId))
  const verified = list.filter((f) => f.status === 'verified').length
  const rejected = list.filter((f) => f.status === 'rejected').length
  const unverified = list.filter((f) => f.status === 'unverified').length
  return `verified:${verified}, unverified:${unverified}, rejected:${rejected}`
}

function formatEvidenceLocation(evidence: FindingEvidence): string {
  const location = evidence.location
  if (location.kind === 'pdf') {
    const page = typeof location.page === 'number' ? `p.${location.page}` : 'p.?'
    const block = location.block ? ` ${location.block}` : ''
    return `${page}${block}`.trim()
  }
  if (location.kind === 'text') {
    const lineStart = typeof location.lineStart === 'number' ? location.lineStart : '?'
    const lineEnd = typeof location.lineEnd === 'number' ? location.lineEnd : lineStart
    return `lines ${lineStart}-${lineEnd}`
  }
  return location.hint ? `unknown (${location.hint})` : 'unknown'
}

function governanceFrontmatter(
  governance?: Partial<EditorialGovernanceMetadata>
): Record<string, string> {
  const normalized = createDefaultEditorialGovernance(governance)
  return {
    editorial_status: normalized.editorial_status,
    approver: normalized.approver,
    approved_at: normalized.approved_at,
    publication_criteria: normalized.publication_criteria.join(' | '),
    legal_notes: normalized.legal_notes
  }
}

export async function createLeadFile(
  input: CreateLeadFileInput,
  ctx: ToolContext
): Promise<CreateLeadFileOutput> {
  await ensureDir(ctx.paths.investigationDir)
  await ensureDir(ctx.paths.leadsDir)
  await ensureDir(ctx.paths.allegationsDir)
  await ensureDir(ctx.paths.findingsDir)

  const labels = getLeadLabels(input.language)
  const normalizedAllegations = (input.allegations ?? []).map((item, idx) => ({
    id: normalizeAllegationId(item.id, idx),
    statement: item.statement
  }))
  const normalizedFindings = (input.findings ?? []).map((item, idx) => ({
    id: normalizeFindingId(item.id, idx),
    claim: item.claim,
    evidence: item.evidence,
    status: item.status,
    allegationIds: item.supportsAllegationIds.map((v) => normalizeAllegationId(v, idx))
  }))

  const leadPath = path.join(ctx.paths.leadsDir, `lead-${input.slug}.md`)
  const status = input.status ?? 'planned'
  const inquiryPlanSection = input.inquiryPlan ? renderInquiryPlanSection(input.inquiryPlan) : undefined

  const leadContent = [
    formatFrontmatter({
      type: 'lead',
      slug: `lead-${input.slug}`,
      title: input.title,
      status,
      created_at: new Date().toISOString(),
      allegations_count: normalizedAllegations.length,
      findings_count: normalizedFindings.length,
      ...governanceFrontmatter()
    }),
    '',
    `# ${labels.contextTitle}`,
    input.description,
    ...(inquiryPlanSection ? ['', inquiryPlanSection] : []),
    '',
    `## ${labels.allegationsIndexTitle}`,
      ...(normalizedAllegations.length
        ? normalizedAllegations.map((item) => `- [[${item.id}]]`)
        : [`- ${labels.fillLaterText}`]),
    '',
    `## ${labels.findingsIndexTitle}`,
      ...(normalizedFindings.length
        ? normalizedFindings.map((item) => `- [[${item.id}]]`)
        : [`- ${labels.fillLaterText}`]),
    ''
  ].join('\n')
  await writeUtf8(leadPath, leadContent)

  const allegationPaths: string[] = []
  const findingPaths: string[] = []

  if (normalizedAllegations.length > 0 || normalizedFindings.length > 0) {
    const persisted = await persistInquiryArtifacts(
      {
        slug: input.slug,
        allegations: input.allegations ?? [],
        findings: input.findings ?? [],
        ...(input.language ? { language: input.language } : {})
      },
      ctx
    )
    allegationPaths.push(...persisted.allegationPaths)
    findingPaths.push(...persisted.findingPaths)
  }

  return { leadPath, allegationPaths, findingPaths }
}

export async function updateLeadPlanAndStatus(
  input: {
    slug: string
    inquiryPlan: InquiryPlan
    language?: string
    status?: 'draft' | 'planned'
  },
  ctx: ToolContext
): Promise<string> {
  const labels = getLeadLabels(input.language)
  const leadPath = path.join(ctx.paths.leadsDir, `lead-${input.slug}.md`)
  const current = await readFile(leadPath, 'utf8')
  const parsed = parseFrontmatter(current)
  const updatedFrontmatter = {
    ...parsed.frontmatter,
    type: parsed.frontmatter.type || 'lead',
    slug: parsed.frontmatter.slug || `lead-${input.slug}`,
    title: parsed.frontmatter.title || input.slug,
    status: input.status ?? 'planned',
    updated_at: new Date().toISOString()
  }

  const planSection = renderInquiryPlanSection(input.inquiryPlan)
  const planRegex = /## Inquiry Plan[\s\S]*?(?=\n## |\s*$)/m
  const body = parsed.body
  const withPlan = body.match(planRegex)
    ? body.replace(planRegex, planSection)
    : `${body.trimEnd()}\n\n${planSection}\n`
  const withIndexes = ensureLeadIndexes(withPlan, labels)
  const finalContent = `${formatFrontmatter(updatedFrontmatter)}\n\n${withIndexes.trimStart()}`
  await writeUtf8(leadPath, `${finalContent.trimEnd()}\n`)
  return leadPath
}

function ensureLeadIndexes(body: string, labels: ReturnType<typeof getLeadLabels>): string {
  const allegationsHeader = `## ${labels.allegationsIndexTitle}`
  const findingsHeader = `## ${labels.findingsIndexTitle}`
  let output = body
  if (!output.includes(allegationsHeader)) {
    output = `${output.trimEnd()}\n\n${allegationsHeader}\n- ${labels.fillLaterText}\n`
  }
  if (!output.includes(findingsHeader)) {
    output = `${output.trimEnd()}\n\n${findingsHeader}\n- ${labels.fillLaterText}\n`
  }
  return output
}

export async function persistInquiryArtifacts(
  input: PersistInquiryArtifactsInput,
  ctx: ToolContext
): Promise<{ allegationPaths: string[]; findingPaths: string[]; reviewPath?: string }> {
  const labels = getLeadLabels(input.language)
  const normalizedAllegations = dedupeById(input.allegations.map((item, idx) => ({
    id: normalizeAllegationId(item.id, idx),
    statement: item.statement
  })))
  const normalizedFindings = dedupeById(input.findings.map((item, idx) => ({
    id: normalizeFindingId(item.id, idx),
    claim: item.claim,
    evidence: item.evidence,
    status: item.status,
    allegationIds: item.supportsAllegationIds.map((v) => normalizeAllegationId(v, idx))
  })))

  const allegationPaths: string[] = []
  for (const allegation of normalizedAllegations) {
    const findingIds = normalizedFindings
      .filter((finding) => finding.allegationIds.includes(allegation.id))
      .map((finding) => finding.id)
    const filePath = path.join(ctx.paths.allegationsDir, `${allegation.id}.md`)
    const body = [
      formatFrontmatter({
        type: 'allegation',
        id: allegation.id,
        lead_slug: `lead-${input.slug}`,
        statement: allegation.statement,
        finding_ids: findingIds,
        status_summary: statusSummary(normalizedFindings, allegation.id),
        critical_write_gate: input.audit?.criticalWriteGate ?? 'approved',
        needs_repair: input.audit?.needsRepair ?? false,
        repair_reasons: (input.audit?.repairReasons ?? []).join(' | '),
        ...governanceFrontmatter(input.governance)
      }),
      '',
      `# ${allegation.statement}`,
      '',
      `## ${labels.linkedFindingsTitle}`,
      ...(findingIds.length ? findingIds.map((id) => `- [[${id}]]`) : [`- ${labels.noLinkedFindings}`]),
      ''
    ].join('\n')
    await writeUtf8(filePath, body)
    allegationPaths.push(filePath)
  }

  const findingPaths: string[] = []
  for (const finding of normalizedFindings) {
    const filePath = path.join(ctx.paths.findingsDir, `${finding.id}.md`)
    const linkedAllegations = finding.allegationIds.filter((id) =>
      normalizedAllegations.some((item) => item.id === id)
    )
    const body = [
      formatFrontmatter({
        type: 'finding',
        id: finding.id,
        lead_slug: `lead-${input.slug}`,
        claim: finding.claim,
        status: finding.status,
        allegation_ids: linkedAllegations,
        critical_write_gate: input.audit?.criticalWriteGate ?? 'approved',
        needs_repair: input.audit?.needsRepair ?? false,
        repair_reasons: (input.audit?.repairReasons ?? []).join(' | '),
        ...governanceFrontmatter(input.governance),
        evidence: finding.evidence.map((item) => {
          return `${item.source_id} [${item.verification_status}] (${formatEvidenceLocation(item)}): ${item.excerpt}`
        })
      }),
      '',
      `# ${finding.claim}`,
      '',
      `${labels.statusLabel}: ${finding.status}`,
      '',
      `## ${labels.evidenceTitle}`,
      ...(finding.evidence.length
        ? finding.evidence.map((item) => {
            const confidence = item.confidence.toFixed(2)
            return `- [${item.verification_status}] ${item.source_id} (${formatEvidenceLocation(item)}, confidence ${confidence}): "${item.excerpt}"`
          })
        : [`- ${labels.evidenceMissing}`]),
      '',
      `## ${labels.relatedAllegationsTitle}`,
      ...(linkedAllegations.length
        ? linkedAllegations.map((id) => `- [[${id}]]`)
        : [`- ${labels.noRelatedAllegations}`]),
      ''
    ].join('\n')
    await writeUtf8(filePath, body)
    findingPaths.push(filePath)
  }

  await upsertLeadIndexes(
    input.slug,
    normalizedAllegations.map((a) => a.id),
    normalizedFindings.map((f) => f.id),
    ctx,
    input.language
  )
  let reviewPath: string | undefined
  if (Array.isArray(input.reviewQueue) && input.reviewQueue.length > 0) {
    reviewPath = path.join(ctx.paths.leadsDir, `lead-${input.slug}.evidence-review.md`)
    const reviewBody = [
      formatFrontmatter({
        type: 'evidence_review_queue',
        lead_slug: `lead-${input.slug}`,
        pending_findings: input.reviewQueue.length,
        created_at: new Date().toISOString(),
        critical_write_gate: input.audit?.criticalWriteGate ?? 'approved',
        needs_repair: input.audit?.needsRepair ?? false,
        repair_reasons: (input.audit?.repairReasons ?? []).join(' | '),
        ...governanceFrontmatter(input.governance)
      }),
      '',
      `# ${labels.evidenceReviewQueueTitle}`,
      '',
      ...input.reviewQueue.map((finding) => {
        const evidenceLines = finding.evidence.map((item) => {
          const confidence = item.confidence.toFixed(2)
          return `  - [${item.verification_status}] ${item.source_id} (${formatEvidenceLocation(item)}, confidence ${confidence}) — "${item.excerpt}"`
        })
        return [`- ${finding.id}: ${finding.claim}`, ...evidenceLines].join('\n')
      }),
      ''
    ].join('\n')
    await writeUtf8(reviewPath, reviewBody)
  }
  return { allegationPaths, findingPaths, ...(reviewPath ? { reviewPath } : {}) }
}

export async function appendLeadConclusion(
  input: AppendLeadConclusionInput,
  ctx: ToolContext
): Promise<string> {
  const labels = getLeadLabels(input.language)
  const leadPath = path.join(ctx.paths.leadsDir, `lead-${input.slug}.md`)
  const current = await readFile(leadPath, 'utf8')
  const scenarioLabel =
    input.scenario === 'positive'
      ? labels.scenarioPositive
      : input.scenario === 'negative'
        ? labels.scenarioNegative
        : labels.scenarioPlanAnother
  const marker = `# ${labels.conclusionTitle}`
  const governance = createDefaultEditorialGovernance(input.governance)
  const auditLines = input.audit
    ? [
        '',
        '## Inquiry Audit',
        `- critical_write_gate: ${input.audit.criticalWriteGate}`,
        `- needs_repair: ${input.audit.needsRepair ? 'true' : 'false'}`,
        `- repair_reasons: ${(input.audit.repairReasons ?? []).join(' | ') || 'none'}`
      ]
    : []
  const governanceLines = [
    '',
    '## Editorial Governance',
    `- editorial_status: ${governance.editorial_status}`,
    `- approver: ${governance.approver || 'n/a'}`,
    `- approved_at: ${governance.approved_at || 'n/a'}`,
    `- publication_criteria: ${governance.publication_criteria.join(' | ') || 'n/a'}`,
    `- legal_notes: ${governance.legal_notes || 'n/a'}`
  ]
  const block = [
    marker,
    '',
    `Scenario: ${scenarioLabel}`,
    '',
    input.conclusion.trim(),
    ...auditLines,
    ...governanceLines,
    ''
  ].join('\n')
  const markerRegex = new RegExp(`${marker.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*$`, 'm')
  const updated = current.includes(marker)
    ? current.replace(
        markerRegex,
        `${marker}\n\nScenario: ${scenarioLabel}\n\n${input.conclusion.trim()}${auditLines.join('\n')}${governanceLines.join('\n')}\n`
      )
    : `${current.trimEnd()}\n\n${block}\n`
  await writeUtf8(leadPath, updated)
  return leadPath
}

async function upsertLeadIndexes(
  slug: string,
  allegationIds: string[],
  findingIds: string[],
  ctx: ToolContext,
  language?: string
): Promise<void> {
  const leadPath = path.join(ctx.paths.leadsDir, `lead-${slug}.md`)
  const current = await readFile(leadPath, 'utf8')
  const labels = getLeadLabels(language)
  const allegationsSection = [
    `## ${labels.allegationsIndexTitle}`,
    ...(allegationIds.length
      ? allegationIds.map((id) => `- [[${id}]]`)
      : [`- ${labels.fillLaterText}`]),
    ''
  ].join('\n')
  const findingsSection = [
    `## ${labels.findingsIndexTitle}`,
    ...(findingIds.length
      ? findingIds.map((id) => `- [[${id}]]`)
      : [`- ${labels.fillLaterText}`]),
    ''
  ].join('\n')

  const allegationsRegex = new RegExp(
    `${`## ${labels.allegationsIndexTitle}`.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=\\n## |\\s*$)`
  )
  const findingsRegex = new RegExp(
    `${`## ${labels.findingsIndexTitle}`.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}[\\s\\S]*?(?=\\n## |\\s*$)`
  )
  const withAllegations = current.match(allegationsRegex)
    ? current.replace(allegationsRegex, allegationsSection.trimEnd())
    : `${current.trimEnd()}\n\n${allegationsSection}`

  const withFindings = withAllegations.match(findingsRegex)
    ? withAllegations.replace(findingsRegex, findingsSection.trimEnd())
    : `${withAllegations.trimEnd()}\n\n${findingsSection}`

  await writeUtf8(leadPath, `${withFindings.trimEnd()}\n`)
}
