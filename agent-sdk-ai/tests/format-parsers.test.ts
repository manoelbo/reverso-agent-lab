import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractJsonCandidate,
  parseLeadSummaryFromMarkdown,
} from '../src/lib/format-parsers'

describe('format-parsers', () => {
  it('extrai JSON embutido em texto', () => {
    const raw = 'prefixo\n{"ok":true,"items":[1,2]}\nrodape'
    assert.equal(extractJsonCandidate(raw), '{"ok":true,"items":[1,2]}')
  })

  it('retorna undefined quando não há JSON válido', () => {
    assert.equal(extractJsonCandidate('sem chaves aqui'), undefined)
  })

  it('faz parse de summary de lead com frontmatter', () => {
    const summary = parseLeadSummaryFromMarkdown({
      fileName: 'lead-fraude-obras.md',
      raw: `---
title: "Fraude em obras públicas"
status: planned
---
`,
    })

    assert.equal(summary.slug, 'fraude-obras')
    assert.equal(summary.title, 'Fraude em obras públicas')
    assert.equal(summary.status, 'planned')
  })

  it('usa fallback de título para heading ou slug', () => {
    const withHeading = parseLeadSummaryFromMarkdown({
      fileName: 'lead-licitacao.md',
      raw: '# Investigação de licitação\nconteúdo',
    })
    assert.equal(withHeading.title, 'Investigação de licitação')

    const withSlug = parseLeadSummaryFromMarkdown({
      fileName: 'lead-caso-x.md',
      raw: 'sem titulo explicito',
    })
    assert.equal(withSlug.title, 'caso-x')
  })
})
