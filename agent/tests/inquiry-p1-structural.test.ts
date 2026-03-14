import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import type { LabPaths } from '../src/core/paths.js'
import { runAgentLoop } from '../src/core/agent-loop.js'
import { createPolicyComplianceHooks } from '../src/core/compliance-hooks.js'
import { runDomainSubagents } from '../src/core/domain-subagents.js'
import {
  getInvestigationCheckpointPath,
  loadInvestigationCheckpoint,
  saveInvestigationCheckpoint
} from '../src/core/investigation-checkpoint.js'
import { validateInquiryPreWrite } from '../src/core/pre-write-validation.js'
import { createLeadFile, persistInquiryArtifacts } from '../src/tools/investigative/create-lead-file.js'

async function buildPathsFixture(): Promise<LabPaths> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'inquiry-p1-'))
  const filesystemDir = path.join(root, 'filesystem')
  const sourceDir = path.join(filesystemDir, 'source')
  const sourceArtifactsDir = path.join(sourceDir, '.artifacts')
  const investigationDir = path.join(filesystemDir, 'investigation')
  await mkdir(sourceArtifactsDir, { recursive: true })
  await mkdir(path.join(investigationDir, 'leads'), { recursive: true })
  await mkdir(path.join(investigationDir, 'allegations'), { recursive: true })
  await mkdir(path.join(investigationDir, 'findings'), { recursive: true })
  await writeFile(
    path.join(sourceDir, 'source-checkpoint.json'),
    JSON.stringify({
      version: 1,
      files: [{ docId: 'doc-1', originalFileName: 'arquivo-1.pdf' }]
    }),
    'utf8'
  )
  return {
    projectRoot: root,
    labRoot: root,
    filesystemDir,
    sourceDir,
    sourceArtifactsDir,
    inputDir: path.join(root, 'input'),
    outputDir: filesystemDir,
    eventsDir: path.join(filesystemDir, 'events'),
    dossierDir: path.join(filesystemDir, 'dossier'),
    dossierPeopleDir: path.join(filesystemDir, 'dossier', 'people'),
    dossierGroupsDir: path.join(filesystemDir, 'dossier', 'groups'),
    dossierPlacesDir: path.join(filesystemDir, 'dossier', 'places'),
    dossierTimelineDir: path.join(filesystemDir, 'dossier', 'timeline'),
    investigationDir,
    leadsDir: path.join(investigationDir, 'leads'),
    allegationsDir: path.join(investigationDir, 'allegations'),
    findingsDir: path.join(investigationDir, 'findings'),
    notesDir: path.join(investigationDir, 'notes'),
    reportsDir: path.join(filesystemDir, 'reports')
  }
}

test('inquiry P1 estrutural: hooks + subagentes + checkpoint + governanca + persistencia', async () => {
  const paths = await buildPathsFixture()
  const complianceEvents: string[] = []
  await createLeadFile(
    {
      slug: 'x',
      title: 'Lead X',
      description: 'Descricao'
    },
    { paths }
  )

  const loopRun = await runAgentLoop({
    actions: [{ tool: 'linkEntities', input: { filePath: path.join(paths.projectRoot, 'nao-existe.md') } }],
    ctx: { paths } as never,
    compliance: createPolicyComplianceHooks({
      defaultDecision: 'allow',
      byCapability: { persist: 'deny' }
    }),
    hooks: {
      onComplianceDecision: ({ phase, decision }) => {
        complianceEvents.push(`${phase}:${decision}`)
      }
    }
  })
  assert.equal(loopRun.stopReason, 'compliance_denied')
  assert.ok(complianceEvents.some((item) => item.includes('pre:deny')))

  const subagents = await runDomainSubagents({
    plans: [
      { domain: 'contracts', objective: 'o', readOnlyContext: 'ctx', maxEvidenceItems: 2 },
      { domain: 'timeline', objective: 'o', readOnlyContext: 'ctx', maxEvidenceItems: 2 }
    ],
    executor: (plan) => ({
      domain: plan.domain,
      ok: true,
      summary: `ok:${plan.domain}`,
      evidence: [
        {
          source_id: 'doc-1',
          source: 'doc-1',
          excerpt: 'trecho',
          location: { kind: 'pdf', page: 1 },
          confidence: 0.8,
          verification_status: 'verified'
        }
      ],
      warnings: []
    })
  })
  assert.equal(subagents.consolidatedEvidence.length, 1)

  await saveInvestigationCheckpoint(paths.investigationDir, {
    leadSlug: 'x',
    stage: 'post_tools',
    loopProgress: {
      stopReason: loopRun.stopReason,
      steps: loopRun.usage.steps,
      toolCalls: loopRun.usage.toolCalls,
      confidence: loopRun.confidence
    }
  })
  const checkpoint = await loadInvestigationCheckpoint(paths.investigationDir, 'x')
  assert.equal(checkpoint?.stage, 'post_tools')

  const governanceValidation = await validateInquiryPreWrite({
    slug: 'x',
    allegations: [{ id: 'allegation-a', statement: 'A' }],
    findings: [],
    reviewQueue: [],
    editorialGovernanceMode: 'strict',
    editorialGovernanceTargets: [
      {
        artifactType: 'lead',
        artifactId: 'lead-x',
        governance: { editorial_status: 'published' }
      }
    ],
    paths
  })
  assert.equal(governanceValidation.ok, false)

  const persisted = await persistInquiryArtifacts(
    {
      slug: 'x',
      allegations: [{ id: 'allegation-a', statement: 'A' }],
      findings: [
        {
          id: 'finding-a',
          claim: 'Claim',
          status: 'verified',
          supportsAllegationIds: ['allegation-a'],
          evidence: [
            {
              source_id: 'doc-1',
              source: 'doc-1',
              excerpt: 'trecho',
              location: { kind: 'pdf', page: 2 },
              confidence: 0.9,
              verification_status: 'verified'
            }
          ]
        }
      ],
      governance: { editorial_status: 'draft' },
      audit: {
        criticalWriteGate: 'approved',
        needsRepair: false
      }
    },
    { paths }
  )

  assert.equal(persisted.allegationPaths.length, 1)
  const allegationContent = await readFile(persisted.allegationPaths[0]!, 'utf8')
  assert.match(allegationContent, /editorial_status: draft/)
  const checkpointPath = getInvestigationCheckpointPath(paths.investigationDir, 'x')
  assert.ok(checkpointPath.endsWith('inquiry-x.checkpoint.json'))
})
