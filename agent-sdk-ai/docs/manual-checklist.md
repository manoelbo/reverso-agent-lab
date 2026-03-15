# Manual checklist (fim-a-fim)

Data: 2026-03-15

## Ambiente

- Serviço iniciado com `pnpm dev` em `http://localhost:3000`.
- Sem `AI_GATEWAY_API_KEY` no ambiente (esperado para validação de fallback de erro no stream).

## Checklist executado

### 1) Upload de PDF + deduplicação por nome

Comando:

```bash
curl -s -X POST -F "files=@/tmp/reverso-e2e/teste.pdf;type=application/pdf" http://localhost:3000/api/upload
curl -s -X POST -F "files=@/tmp/reverso-e2e/teste.pdf;type=application/pdf" http://localhost:3000/api/upload
```

Resultado:

- 1ª chamada: `{"accepted":["teste.pdf"],"rejected":[]}`
- 2ª chamada: `{"accepted":[],"rejected":[{"fileName":"teste.pdf","reason":"Arquivo já existe na source."}]}`

### 2) Stream de chat com data parts de workflow

Comando:

```bash
curl -s -N -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"u1","role":"user","parts":[{"type":"text","text":"oi"}]}],"autoAccept":false}' \
  http://localhost:3000/api/chat
```

Validações observadas no stream SSE:

- `data-workflow` emitido em `preflight` e `execution`.
- `data-queue` emitido com steps e progresso.
- `data-suggestion` refletindo modo de aprovação.
- `messageMetadata` com `intent` e `confidence`.
- erro final descritivo de autenticação do AI Gateway (fallback esperado sem chave).

### 3) Variação auto-accept on/off

Comando:

```bash
curl -s -N -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"u2","role":"user","parts":[{"type":"text","text":"processa os pdfs"}]}],"autoAccept":true}' \
  http://localhost:3000/api/chat
```

Resultado:

- `data-suggestion.action` passou para modo automático:
  - `"Auto-accept está ativo; ferramentas sensíveis serão executadas automaticamente."`

## Observação

Com `AI_GATEWAY_API_KEY` ou `OPENROUTER_API_KEY` configurada, o mesmo checklist acima deve continuar válido, com diferença de que o fluxo não encerrará em erro de autenticação e seguirá para geração completa do agente.
