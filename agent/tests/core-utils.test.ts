import test from 'node:test'
import assert from 'node:assert/strict'
import { slugify } from '../src/core/fs-io.js'
import { buildSourceTrace, formatFrontmatter } from '../src/core/markdown.js'

test('slugify remove acentos e simbolos', () => {
  const value = slugify('Combate à Erosão - Jardim Novo Parelheiros')
  assert.equal(value, 'combate-a-erosao-jardim-novo-parelheiros')
})

test('formatFrontmatter gera yaml basico', () => {
  const result = formatFrontmatter({
    type: 'investigation',
    title: 'Linha Teste',
    checklist: ['item A', 'item B']
  })
  assert.match(result, /^---/)
  assert.match(result, /type: investigation/)
  assert.match(result, /checklist:/)
})

test('buildSourceTrace inclui pagina quando informada', () => {
  assert.equal(buildSourceTrace('contrato-01.pdf', 12), '→[source:contrato-01.pdf#p12]')
  assert.equal(buildSourceTrace('contrato-01.pdf'), '→[source:contrato-01.pdf]')
})

