import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCreateLeadSystemPrompt, buildCreateLeadUserPrompt } from '../src/prompts/create-lead.js'
import { getToolManifestForPrompt } from '../src/prompts/tool-manifest.js'
import {
  parseCreateLeadResponse,
  normalizeLeadSlug
} from '../src/runner/run-create-lead.js'

test('parseCreateLeadResponse retorna objeto valido para JSON correto', () => {
  const raw = `{"codename":"taludes-instabilidade","title":"Taludes e erosao","description":"Apuracao inicial","inquiryPlan":{"formulateAllegations":["A1"],"defineSearchStrategy":["S1"],"gatherFindings":["G1"],"mapToAllegations":["M1"]}}`
  const out = parseCreateLeadResponse(raw)
  assert.equal(out.codename, 'taludes-instabilidade')
  assert.equal(out.title, 'Taludes e erosao')
  assert.equal(out.description, 'Apuracao inicial')
  assert.equal(out.inquiryPlan.formulateAllegations[0], 'A1')
})

test('parseCreateLeadResponse aceita JSON com code fence', () => {
  const raw =
    '```json\n{"codename":"x","title":"T","description":"D","inquiryPlan":{"formulateAllegations":[],"defineSearchStrategy":[],"gatherFindings":[],"mapToAllegations":[]}}\n```'
  const out = parseCreateLeadResponse(raw)
  assert.equal(out.codename, 'x')
  assert.equal(out.title, 'T')
})

test('parseCreateLeadResponse falha para JSON invalido', () => {
  assert.throws(() => parseCreateLeadResponse('not json at all'))
})

test('normalizeLeadSlug normaliza slug sem prefixo lead-', () => {
  assert.equal(normalizeLeadSlug('cartel combinacao'), 'cartel-combinacao')
  assert.equal(normalizeLeadSlug('Cartel Combinacao'), 'cartel-combinacao')
})

test('normalizeLeadSlug remove prefixo lead- quando presente', () => {
  assert.equal(normalizeLeadSlug('lead-cartel-combination'), 'cartel-combination')
})

test('normalizeLeadSlug retorna investigacao para string vazia apos slugify', () => {
  assert.equal(normalizeLeadSlug('---'), 'investigation')
})

test('buildCreateLeadSystemPrompt inclui manifesto de tools', () => {
  const manifest = getToolManifestForPrompt()
  const prompt = buildCreateLeadSystemPrompt(manifest)
  assert.match(prompt, /Available agent tools:/)
  assert.match(prompt, /createDossierEntity/)
  assert.match(prompt, /Inquiry Plan/)
})

test('buildCreateLeadUserPrompt inclui resumo de source quando fornecido', () => {
  const prompt = buildCreateLeadUserPrompt('cartel de licitantes', '1. contrato-a.md\n2. contrato-b.md')
  assert.match(prompt, /Available sources for this investigation:/)
  assert.match(prompt, /contrato-a\.md/)
  assert.match(prompt, /cartel de licitantes/)
})
