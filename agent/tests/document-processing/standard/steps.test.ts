/**
 * Testes unitarios dos steps do Standard Process.
 * Mock do OpenRouterClient -- sem chamadas reais a API.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { runStepNotes } from '../../../src/tools/document-processing/standard/steps/step-notes.js'
import { runStepPersons } from '../../../src/tools/document-processing/standard/steps/step-persons.js'
import { runStepGroups } from '../../../src/tools/document-processing/standard/steps/step-groups.js'
import { runStepPlaces } from '../../../src/tools/document-processing/standard/steps/step-places.js'
import { runStepEvents } from '../../../src/tools/document-processing/standard/steps/step-events.js'
import { runStepPostprocess } from '../../../src/tools/document-processing/standard/steps/step-postprocess.js'
import type { CacheContext } from '../../../src/tools/document-processing/standard/cache-context.js'
import type { OpenRouterClient } from '../../../src/tools/document-processing/openrouter-client.js'

// ─── Mock CacheContext ────────────────────────────────────────────────────────

function makeMockCtx(): CacheContext {
  return {
    pdfUserMessage: { role: 'user', content: 'mock' },
    firstAssistantMessage: { role: 'assistant', content: 'mock response' },
    annotations: [],
    model: 'google/gemini-2.0-flash-lite-001',
    sourceFileName: 'test-doc.pdf'
  }
}

/**
 * Cria um mock de OpenRouterClient que retorna uma resposta fixa.
 */
function makeMockClient(responseJson: unknown): OpenRouterClient {
  return {
    chatCached: async () => ({
      content: JSON.stringify(responseJson),
      annotations: [],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      rawModel: 'mock'
    }),
    chatWithPdf: async () => ({
      content: JSON.stringify(responseJson),
      annotations: [],
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      rawModel: 'mock'
    }),
    chatMarkdown: async () => ({
      content: 'mock',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    })
  } as unknown as OpenRouterClient
}

// ─── step-notes.ts ────────────────────────────────────────────────────────────

test('runStepNotes: parseia JSON e retorna notes estruturadas em memoria', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-notes-'))
  try {
    const notesJson = [
      {
        category: 'RED_FLAG',
        page: 3,
        highlight: 'valor de R$ 4.500.000,00',
        description: 'Valor muito acima do mercado',
        tags: ['superfaturamento']
      },
      {
        category: 'CLAIM',
        page: 1,
        highlight: 'assinado em 15/03/2024',
        description: 'Data de assinatura do contrato',
        tags: ['data', 'contrato']
      }
    ]

    const result = await runStepNotes({
      ctx: makeMockCtx(),
      sourceFileName: 'test-doc.pdf',
      client: makeMockClient(notesJson)
    })

    assert.equal(result.notesCount, 2)
    assert.equal(result.notes.length, 2)
    assert.ok(result.notes.some((n) => n.category === 'RED_FLAG'))
    assert.ok(result.notes.some((n) => n.category === 'CLAIM'))
    assert.ok(result.notes.every((n) => n.status === 'unverified'))
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('runStepNotes: retorna vazio sem erros quando JSON e array vazio', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-notes-empty-'))
  try {
    const result = await runStepNotes({
      ctx: makeMockCtx(),
      sourceFileName: 'test-doc.pdf',
      client: makeMockClient([])
    })
    assert.equal(result.notesCount, 0)
    assert.equal(result.notes.length, 0)
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// ─── step-persons.ts ──────────────────────────────────────────────────────────

test('runStepPersons: cria arquivo .md para cada person extraida', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-persons-'))
  try {
    const peopleDir = path.join(dir, 'people')
    const personsJson = [
      {
        type: 'person',
        name: 'João Silva',
        aliases: ['J. Silva'],
        category: 'politician',
        role_in_document: 'Secretário Municipal',
        why_relevant: 'Assinou contratos emergenciais',
        first_seen_in: 'test-doc.pdf',
        pages_mentioned: [1, 5],
        tags: ['prefeitura', 'contrato'],
        summary: 'João Silva é secretário municipal ligado a contratos emergenciais.'
      }
    ]

    const result = await runStepPersons({
      ctx: makeMockCtx(),
      peopleDir,
      client: makeMockClient(personsJson)
    })

    assert.equal(result.created.length, 1)
    assert.equal(result.updated.length, 0)

    const filePath = result.created[0]!
    assert.ok(existsSync(filePath), 'Arquivo de person nao foi criado')

    const content = readFileSync(filePath, 'utf8')
    assert.ok(content.includes('type: person'), 'Frontmatter deve ter type: person')
    assert.ok(content.includes('João Silva'), 'Deve conter o nome')
    assert.ok(content.includes('## Resumo'), 'Deve ter secao Resumo')
    assert.ok(content.includes('## Papel nos documentos'), 'Deve ter secao Papel nos documentos')
    assert.ok(content.includes('## Anotações investigativas'), 'Deve ter secao de anotacoes')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// ─── step-groups.ts ───────────────────────────────────────────────────────────

test('runStepGroups: cria arquivo .md para cada group extraido', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-groups-'))
  try {
    const groupsDir = path.join(dir, 'groups')
    const groupsJson = [
      {
        type: 'group',
        name: 'Construtora XYZ Ltda',
        category: 'company',
        registration_id: '12.345.678/0001-90',
        members: ['[[João Silva]]'],
        role_in_document: 'Contratada principal',
        why_relevant: 'Venceu licitacao com valor atipico',
        first_seen_in: 'test-doc.pdf',
        pages_mentioned: [1, 3, 12],
        tags: ['licitacao', 'emergencial'],
        summary: 'Construtora XYZ venceu licitação emergencial.'
      }
    ]

    const result = await runStepGroups({
      ctx: makeMockCtx(),
      groupsDir,
      client: makeMockClient(groupsJson)
    })

    assert.equal(result.created.length, 1)
    const content = readFileSync(result.created[0]!, 'utf8')
    assert.ok(content.includes('type: group'))
    assert.ok(content.includes('12.345.678/0001-90'), 'Deve conter registration_id')
    assert.ok(content.includes('## Membros / Representantes'), 'Deve ter secao Membros')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// ─── step-places.ts ───────────────────────────────────────────────────────────

test('runStepPlaces: cria arquivo .md com hierarquia country/city', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-places-'))
  try {
    const placesDir = path.join(dir, 'places')
    const placesJson = [
      {
        type: 'place',
        name: 'Canteiro de obras Zona Leste',
        country: 'Brasil',
        city: 'São Paulo',
        neighborhood: 'Itaquera',
        address: 'Av. Águia de Haia, 2300',
        coordinates: null,
        context: 'Local de execução da obra emergencial',
        first_seen_in: 'test-doc.pdf',
        pages_mentioned: [3, 8],
        tags: ['obra', 'emergencial']
      }
    ]

    const result = await runStepPlaces({
      ctx: makeMockCtx(),
      placesDir,
      client: makeMockClient(placesJson)
    })

    assert.equal(result.created.length, 1)
    const filePath = result.created[0]!

    // Verifica hierarquia de paths
    assert.ok(filePath.includes('Brasil'), 'Path deve conter pais')
    assert.ok(filePath.includes('São Paulo'), 'Path deve conter cidade')

    const content = readFileSync(filePath, 'utf8')
    assert.ok(content.includes('type: place'))
    assert.ok(content.includes('Itaquera'), 'Deve conter bairro')
    assert.ok(content.includes('## Contexto nos documentos'), 'Deve ter secao de contexto')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// ─── step-events.ts ───────────────────────────────────────────────────────────

test('runStepEvents: cria arquivo mensal de timeline com evento', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-events-'))
  try {
    const timelineDir = path.join(dir, 'timeline')
    const eventsJson = [
      {
        type: 'event',
        date: '2024-03-15',
        title: 'Assinatura de contrato emergencial',
        actors: ['[[Prefeitura de São Paulo]]', '[[Construtora XYZ]]'],
        event_type: 'contract_signing',
        source: 'test-doc.pdf',
        page: 5,
        description: 'Prefeitura assina contrato emergencial com Construtora XYZ.',
        follows: null,
        tags: ['contrato', 'emergencial']
      }
    ]

    const result = await runStepEvents({
      ctx: makeMockCtx(),
      timelineDir,
      client: makeMockClient(eventsJson)
    })

    assert.ok(result.eventsPaths.length > 0, 'Deve ter pelo menos 1 arquivo de timeline')
    const filePath = result.eventsPaths[0]!
    assert.ok(filePath.includes('2024'), 'Path deve conter o ano')
    assert.ok(existsSync(filePath), 'Arquivo de timeline nao existe')

    const content = readFileSync(filePath, 'utf8')
    assert.ok(content.includes(':::event'), 'Deve conter bloco event')
    assert.ok(content.includes('2024-03-15'), 'Deve conter a data')
    assert.ok(content.includes('contract_signing'), 'Deve conter event_type')
  } finally {
    rmSync(dir, { recursive: true })
  }
})

// ─── step-postprocess.ts ──────────────────────────────────────────────────────

test('runStepPostprocess: atualiza metadata.md e preview.md com entities e notes', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'step-postprocess-'))
  try {
    const artifactDir = dir

    // Cria preview.md inicial
    const previewContent = `---
title: "Test Doc"
type: preview
---

## Executive summary

Documento de teste.
`
    await writeFile(path.join(artifactDir, 'preview.md'), previewContent, 'utf8')

    // Cria metadata.md inicial
    const metadataContent = `---
type: metadata
---

# Metadados
`
    await writeFile(path.join(artifactDir, 'metadata.md'), metadataContent, 'utf8')

    const result = await runStepPostprocess({
      artifactDir,
      entities: {
        persons: [path.join(dir, 'people', 'joao-silva.md')],
        groups: [path.join(dir, 'groups', 'construtora-xyz.md')],
        places: [],
        events: [path.join(dir, 'timeline', '2024', '2024-03.md')],
        notes: [
          {
            category: 'RED_FLAG',
            source: 'test-doc.pdf',
            page: 1,
            highlight: 'valor de R$ 9.999.999,00',
            description: 'Valor elevado para o escopo apresentado.',
            tags: ['valor_atipico'],
            status: 'unverified',
            createdAt: new Date().toISOString()
          }
        ]
      }
    })

    // Verifica metadata.md foi atualizado
    const updatedMetadata = readFileSync(result.metadataPath, 'utf8')
    assert.ok(
      updatedMetadata.includes('Entidades extraídas (Standard Process)'),
      'metadata.md deve ter secao de entidades'
    )
    assert.ok(updatedMetadata.includes('persons_mentioned'), 'metadata.md deve listar persons')

    // Verifica preview.md foi atualizado com notes
    const updatedPreview = readFileSync(result.previewPath, 'utf8')
    assert.ok(updatedPreview.includes('Notes geradas'), 'preview.md deve ter secao de notes')
    assert.ok(
      updatedPreview.includes('valor de R$ 9.999.999,00'),
      'preview.md deve listar o highlight da note'
    )
  } finally {
    rmSync(dir, { recursive: true })
  }
})
