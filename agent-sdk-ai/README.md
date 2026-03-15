# Reverso — AI SDK

Refatoração do agente Reverso usando **Vercel AI SDK** (Core + UI) em `Next.js`.

## Rodar localmente

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

App: `http://localhost:3000`

## Scripts

- `pnpm dev`: ambiente de desenvolvimento
- `pnpm typecheck`: checagem de tipos
- `pnpm test`: suíte de testes
- `pnpm build`: build de produção

## Variáveis principais

- `AI_GATEWAY_API_KEY` (opcional, recomendado com AI Gateway)
- `OPENROUTER_API_KEY` (opcional para provider OpenRouter compatível)
- `REVERSO_MODEL_ID`
- `REVERSO_AGENT_LEGACY_ROOT` (path para projeto legado)
- `REVERSO_FILESYSTEM_ROOT` (path do filesystem investigativo)
- `REVERSO_AUTO_ACCEPT_DEFAULT`
- `REVERSO_DEEP_DIVE_SESSION_TTL_MS`

## Fluxo implementado (visão rápida)

- Endpoint de chat com `ToolLoopAgent` e stream de `UIMessage`.
- Fila de pré-flight baseada em estado:
  - source vazia
  - pendências de processamento
  - init automático sem `agent.md`
  - continuidade de sessão deep-dive
- Tools investigativas com approvals e modo auto-accept.
- Data parts no stream (`workflow`, `queue`, `suggestion`, `sourceState`).
