import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { createDraftLeadsFromTopLines, slugFromLeadTitle } from '../src/runner/run-dig.js'
import { heuristicIntent, resolveLeadTargetFromText } from '../src/runner/run-deep-dive-next.js'
import { createLeadFile, updateLeadPlanAndStatus } from '../src/tools/investigative/create-lead-file.js'
import type { LabPaths } from '../src/core/paths.js'

test('slugFromLeadTitle normaliza acentos e pontuacao', () => {
  assert.equal(slugFromLeadTitle('Talude: São João!'), 'talude-sao-joao')
})

test('createDraftLeadsFromTopLines evita duplicata por slug/titulo e limita 3', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deep-dive-test-'))
  const leadsDir = path.join(root, 'leads')
  await mkdir(leadsDir, { recursive: true })
  await writeFile(
    path.join(leadsDir, 'lead-talude-risco.md'),
    ['---', 'title: "Talude risco"', '---', '', '# Context', 'texto'].join('\n'),
    'utf8'
  )
  const created: string[] = []
  const out = await createDraftLeadsFromTopLines(
    [
      { rank: 1, title: 'Talude risco', description: 'desc 1', differentiation: 'd1' },
      { rank: 2, title: 'Contrato café', description: 'desc 2', differentiation: 'd2' },
      { rank: 3, title: 'Escola tremembé', description: 'desc 3', differentiation: 'd3' }
    ],
    leadsDir,
    {
      createLead: async (input) => {
        created.push(input.slug)
        return { leadPath: path.join(leadsDir, `lead-${input.slug}.md`) }
      }
    }
  )
  assert.equal(out.length, 3)
  assert.equal(out[0]?.createdInLastRun, false)
  assert.deepEqual(created, ['contrato-cafe', 'escola-tremembe'])
  await rm(root, { recursive: true, force: true })
})

test('createDraftLeadsFromTopLines aplica dedupe semantico por similaridade', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deep-dive-semantic-'))
  const leadsDir = path.join(root, 'leads')
  await mkdir(leadsDir, { recursive: true })
  await writeFile(
    path.join(leadsDir, 'lead-financial-implications-siurb.md'),
    ['---', 'title: "Financial Implications of Varying SIURB Unit Cost Tables"', '---', '', '# Context', 'texto base'].join('\n'),
    'utf8'
  )
  const created: string[] = []
  const out = await createDraftLeadsFromTopLines(
    [
      {
        rank: 1,
        title: 'Financial impact of varying SIURB unit cost table',
        description: 'cost variation impact analysis',
        differentiation: 'd'
      }
    ],
    leadsDir,
    {
      createLead: async (input) => {
        created.push(input.slug)
        return { leadPath: path.join(leadsDir, `lead-${input.slug}.md`) }
      }
    }
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.createdInLastRun, false)
  assert.equal(out[0]?.duplicateReason, 'semantic_similarity')
  assert.equal(created.length, 0)
  await rm(root, { recursive: true, force: true })
})

test('createDraftLeadsFromTopLines nao bloqueia temas distintos', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'deep-dive-distinct-'))
  const leadsDir = path.join(root, 'leads')
  await mkdir(leadsDir, { recursive: true })
  await writeFile(
    path.join(leadsDir, 'lead-contract-pricing-risk.md'),
    ['---', 'title: "Contract pricing risk signals"', '---', '', '# Context', 'texto base'].join('\n'),
    'utf8'
  )
  const created: string[] = []
  const out = await createDraftLeadsFromTopLines(
    [
      {
        rank: 1,
        title: 'School infrastructure oversight failures',
        description: 'Focus on school renovation supervision and delivery gaps',
        differentiation: 'd'
      }
    ],
    leadsDir,
    {
      createLead: async (input) => {
        created.push(input.slug)
        return { leadPath: path.join(leadsDir, `lead-${input.slug}.md`) }
      }
    }
  )
  assert.equal(out.length, 1)
  assert.equal(out[0]?.createdInLastRun, true)
  assert.equal(created.length, 1)
  await rm(root, { recursive: true, force: true })
})

test('createLeadFile draft sem inquiry plan e updateLeadPlanAndStatus insere plano', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lead-draft-test-'))
  const paths: LabPaths = {
    projectRoot: root,
    labRoot: root,
    filesystemDir: root,
    sourceDir: path.join(root, 'source'),
    sourceArtifactsDir: path.join(root, 'source', '.artifacts'),
    inputDir: path.join(root, 'input'),
    outputDir: root,
    eventsDir: path.join(root, 'events'),
    dossierDir: path.join(root, 'dossier'),
    dossierPeopleDir: path.join(root, 'dossier', 'people'),
    dossierGroupsDir: path.join(root, 'dossier', 'groups'),
    dossierPlacesDir: path.join(root, 'dossier', 'places'),
    dossierTimelineDir: path.join(root, 'dossier', 'timeline'),
    investigationDir: path.join(root, 'investigation'),
    leadsDir: path.join(root, 'investigation', 'leads'),
    allegationsDir: path.join(root, 'investigation', 'allegations'),
    findingsDir: path.join(root, 'investigation', 'findings'),
    notesDir: path.join(root, 'investigation', 'notes'),
    reportsDir: path.join(root, 'reports')
  }

  await createLeadFile(
    {
      slug: 'lead-a',
      title: 'Lead A',
      description: 'Descricao A',
      status: 'draft'
    },
    { paths }
  )

  const leadPath = path.join(paths.leadsDir, 'lead-lead-a.md')
  const before = await readFile(leadPath, 'utf8')
  assert.match(before, /status: draft/)
  assert.doesNotMatch(before, /## Inquiry Plan/)

  await updateLeadPlanAndStatus(
    {
      slug: 'lead-a',
      status: 'planned',
      inquiryPlan: {
        formulateAllegations: ['A1'],
        defineSearchStrategy: ['S1'],
        gatherFindings: ['G1'],
        mapToAllegations: ['M1']
      }
    },
    { paths }
  )
  const after = await readFile(leadPath, 'utf8')
  assert.match(after, /status: planned/)
  assert.match(after, /## Inquiry Plan/)
  await rm(root, { recursive: true, force: true })
})

test('heuristicIntent interpreta plano todos e execute primeiro', () => {
  const planAll = heuristicIntent('gostei, pode fazer o plano de todos', 'awaiting_plan_decision')
  assert.equal(planAll.intent, 'plan_all')
  const execOne = heuristicIntent('execute só o primeiro', 'awaiting_inquiry_execution')
  assert.equal(execOne.intent, 'execute_one')
  assert.equal(execOne.targetIndex, 1)
})

test('resolveLeadTargetFromText resolve por slug e por titulo normalizado', () => {
  const leads = [
    {
      slug: 'contrato-cafe',
      title: 'Contrato Café',
      description: 'd1',
      status: 'draft' as const,
      createdInLastRun: true
    },
    {
      slug: 'erosao-aricanduva',
      title: 'Erosão Aricanduva',
      description: 'd2',
      status: 'draft' as const,
      createdInLastRun: true
    }
  ]
  const bySlug = resolveLeadTargetFromText('faz o plano do lead contrato-cafe', leads)
  assert.equal(bySlug.kind, 'slug_exact')
  assert.equal(bySlug.lead?.slug, 'contrato-cafe')

  const byTitle = resolveLeadTargetFromText('faz o plano do lead erosao aricanduva', leads)
  assert.equal(byTitle.kind, 'title_exact')
  assert.equal(byTitle.lead?.slug, 'erosao-aricanduva')
})

test('resolveLeadTargetFromText retorna ambiguo quando ha multiplos candidatos', () => {
  const leads = [
    {
      slug: 'erosao-talude-centro',
      title: 'Erosao talude centro',
      description: 'd1',
      status: 'draft' as const,
      createdInLastRun: true
    },
    {
      slug: 'erosao-talude-zona-leste',
      title: 'Erosao talude zona leste',
      description: 'd2',
      status: 'draft' as const,
      createdInLastRun: true
    }
  ]
  const resolved = resolveLeadTargetFromText('faz o plano do lead erosao talude', leads)
  assert.equal(resolved.kind, 'ambiguous')
  assert.ok((resolved.candidates?.length ?? 0) >= 2)
})

