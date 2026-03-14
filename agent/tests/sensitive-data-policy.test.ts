import test from 'node:test'
import assert from 'node:assert/strict'
import { detectSensitiveData, sanitizeForLlm } from '../src/core/sensitive-data-policy.js'

test('detectSensitiveData encontra email, telefone e cpf', () => {
  const text = 'Contato: ana@email.com, tel +55 11 99999-1234, cpf 123.456.789-09.'
  const matches = detectSensitiveData(text, 'mask')
  assert.ok(matches.some((item) => item.kind === 'email'))
  assert.ok(matches.some((item) => item.kind === 'phone'))
  assert.ok(matches.some((item) => item.kind === 'cpf'))
})

test('sanitizeForLlm aplica estratégia mask em modo warn', () => {
  const text = 'API key: sk-abcd1234efgh5678 e email teste@empresa.com'
  const result = sanitizeForLlm({
    text,
    mode: 'warn',
    strategy: 'mask'
  })
  assert.equal(result.blocked, false)
  assert.ok(result.matches.length >= 2)
  assert.notEqual(result.sanitizedText, text)
  assert.match(result.sanitizedText, /\*/)
})

test('sanitizeForLlm modo strict bloqueia envio mesmo com sanitização', () => {
  const result = sanitizeForLlm({
    text: 'cpf 123.456.789-09',
    mode: 'strict',
    strategy: 'redact'
  })
  assert.equal(result.matches.length, 1)
  assert.equal(result.blocked, true)
  assert.match(result.sanitizedText, /\[REDACTED_CPF\]/)
})

test('sanitizeForLlm em modo off não altera texto', () => {
  const text = 'Narrativa jornalística sem dado sensível real.'
  const result = sanitizeForLlm({
    text,
    mode: 'off'
  })
  assert.equal(result.sanitizedText, text)
  assert.equal(result.matches.length, 0)
  assert.equal(result.blocked, false)
})
