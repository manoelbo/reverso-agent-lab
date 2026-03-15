import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractLatestUserText,
  normalizeMessages,
} from '../src/app/api/chat/route-helpers'

describe('chat route helpers', () => {
  it('normaliza mensagens inválidas para array vazio', () => {
    assert.deepEqual(normalizeMessages(undefined), [])
    assert.deepEqual(normalizeMessages({}), [])
  })

  it('extrai texto da última mensagem de usuário', () => {
    const messages = [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'mensagem antiga' }],
      },
      {
        role: 'assistant',
        parts: [{ type: 'text', text: 'resposta' }],
      },
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'pergunta atual' },
          { type: 'text', text: 'com complemento' },
        ],
      },
    ]

    assert.equal(
      extractLatestUserText(messages),
      'pergunta atual\ncom complemento'
    )
  })
})
