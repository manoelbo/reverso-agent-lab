import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractLatestUserText,
  nextStepSuggestion,
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

  it('gera sugestão contextual para próximos passos por intent', () => {
    assert.ok(nextStepSuggestion('deep_dive').includes('aprovar uma linha sugerida'))
    assert.ok(nextStepSuggestion('create_lead').includes('executar inquiry no lead criado'))
    assert.ok(nextStepSuggestion('run_inquiry').includes('alegações/findings'))
    assert.ok(nextStepSuggestion('process_documents').includes('fontes processadas'))
    assert.ok(nextStepSuggestion('general_chat').includes('deep-dive'))
  })
})
