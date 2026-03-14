# Reverso — Agente Investigativo Lab

Laboratório isolado do **Reverso**, um agente investigativo jornalístico (OSINT) que processa documentos PDF, extrai artefatos estruturados, sugere leads e conduz investigações com raciocínio passo a passo.

```
Frontend (React/Vite :5173)
    ↕ HTTP + SSE
Backend (Node HTTP :3210)
    ↕ OpenRouter API
LLM (Gemini 2.5 Flash por padrão)
    ↓
agent/filesystem/  ←  PDFs → artefatos, leads, dossiês, linha do tempo
```

---

## Pré-requisitos

- **Node.js** ≥ 20
- **pnpm** ≥ 9 — `npm install -g pnpm`
- **Chave de API OpenRouter** — [openrouter.ai](https://openrouter.ai)

---

## Setup

### 1. Instalar dependências

```bash
# Na raiz do projeto (instala tudo de uma vez via pnpm workspaces)
pnpm install
```

### 2. Configurar variáveis de ambiente

Crie o arquivo `.env.local` na raiz do projeto:

```bash
cp agent/.env.example .env.local
```

Edite `.env.local` com suas credenciais:

```env
OPENROUTER_API_KEY=sk-or-v1-...
AGENT_LAB_MODEL=google/gemini-2.5-flash
```

---

## Rodando o projeto

### Tudo de uma vez (recomendado)

```bash
chmod +x start.sh
./start.sh
```

Isso sobe o backend (`http://localhost:3210`) e o frontend (`http://localhost:5173`) em paralelo. Pressione `Ctrl+C` para encerrar ambos.

### Manualmente (dois terminais)

**Terminal 1 — Backend:**
```bash
cd agent
pnpm serve
```

**Terminal 2 — Frontend:**
```bash
cd agent/interface
pnpm dev
```

Acesse a interface em `http://localhost:5173`.

---

## Fluxo de primeira investigação

### 1. Adicionar documentos de origem

Coloque os PDFs que deseja investigar em:
```
agent/filesystem/source/
```

### 2. Processar os documentos

```bash
cd agent
pnpm source:process-all
```

Cada PDF gera artefatos em `agent/filesystem/source/.artifacts/`:
- `preview.md` — resumo executivo
- `index.md` — índice de conteúdo
- `metadata.md` — entidades, datas, valores extraídos

### 3. Inicializar o contexto da investigação

```bash
cd agent
pnpm init
```

Gera o arquivo `agent/filesystem/agent.md` com o contexto consolidado da investigação.

### 4. Descobrir leads (deep-dive)

```bash
cd agent
pnpm deep-dive
```

O agente analisa os documentos e propõe hipóteses investigativas como leads estruturados.

### 5. Executar inquiry em um lead

```bash
cd agent
pnpm inquiry --lead <slug-do-lead>
```

O agente investiga o lead escolhido, cruza evidências e gera findings.

---

## Scripts disponíveis

### Backend (`cd agent`)

| Script | Descrição |
|--------|-----------|
| `pnpm serve` | Sobe o servidor HTTP na porta 3210 |
| `pnpm serve:test` | Servidor com filesystem isolado para testes |
| `pnpm init` | Inicializa o contexto da investigação |
| `pnpm deep-dive` | Sessão de deep-dive para descoberta de leads |
| `pnpm deep-dive-next` | Continua a sessão de deep-dive atual |
| `pnpm inquiry --lead <slug>` | Investiga um lead específico |
| `pnpm source:process-all` | Processa todos os PDFs em `filesystem/source/` |
| `pnpm source:process-queue` | Processa apenas os PDFs na fila |
| `pnpm source:watch` | Monitora a pasta e processa novos arquivos automaticamente |

### Resets

| Script | Descrição |
|--------|-----------|
| `pnpm reset:chat` | Limpa o histórico de conversa |
| `pnpm reset:investigation` | Limpa leads, dossiês e alegações |
| `pnpm reset:sources-artefacts` | Remove artefatos gerados dos PDFs |
| `pnpm reset:all` | Reset completo do filesystem |

### Frontend (`cd agent/interface`)

| Script | Descrição |
|--------|-----------|
| `pnpm dev` | Dev server com hot-reload (porta 5173) |
| `pnpm build` | Build de produção |
| `pnpm preview` | Preview do build de produção |

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `OPENROUTER_API_KEY` | — | **Obrigatório** — chave da API OpenRouter |
| `AGENT_LAB_MODEL` | `google/gemini-2.5-flash` | Modelo de LLM utilizado |
| `AGENT_PORT` | `3210` | Porta do servidor backend |
| `AGENT_CORS_ORIGIN` | `http://localhost:5173` | Origem permitida pelo CORS |
| `AGENT_TEST_MODE` | `false` | Ativa modo de teste com filesystem isolado |
| `AGENT_LAB_LOOP_MAX_STEPS` | `6` | Máximo de passos por rodada do agente |
| `AGENT_LAB_LOOP_MAX_TOOL_CALLS` | `12` | Máximo de tool calls por rodada |
| `AGENT_LAB_LOOP_MAX_ELAPSED_MS` | `120000` | Timeout do loop do agente (ms) |
| `AGENT_LAB_CONFIDENCE_THRESHOLD` | `0.75` | Limiar de confiança mínimo |
| `AGENT_LAB_SELF_REPAIR_ENABLED` | `false` | Ativa ciclo de auto-reparo (critique-repair) |
| `AGENT_LAB_EVIDENCE_GATE_ENABLED` | `false` | Gate de verificação de evidências |
| `AGENT_LAB_P2_EVIDENCE_VERIFICATION_MODE` | `lexical` | Modo de verificação: `lexical`, `semantic` ou `hybrid` |
| `AGENT_LAB_P2_SENSITIVE_DATA_POLICY_MODE` | `warn` | Política de dados sensíveis: `off`, `warn` ou `strict` |
| `AGENT_LAB_EDITORIAL_GOVERNANCE_ENABLED` | `false` | Ativa governança editorial |
| `AGENT_LAB_RESPONSE_LANGUAGE_OVERRIDE` | `auto` | Idioma das respostas do agente |
| `AGENT_LAB_ARTIFACT_LANGUAGE_OVERRIDE` | `source` | Idioma dos artefatos gerados |

---

## Estrutura do projeto

```
reverso_agent_lab/
├── start.sh                        ← inicia backend + frontend de uma vez
├── agente-workflow-design.md       ← documentação do design de workflow
└── agent/
    ├── .env.example                ← template de variáveis de ambiente
    ├── src/
    │   ├── index.ts                ← CLI principal (roteador de comandos)
    │   ├── server/                 ← servidor HTTP + SSE (porta 3210)
    │   ├── core/                   ← loop ReAct, orquestração, ferramentas
    │   ├── runner/                 ← runners de cada modo do agente
    │   ├── prompts/                ← system prompts por modo
    │   ├── tools/
    │   │   ├── document-processing/  ← pipeline de processamento de PDFs
    │   │   └── investigative/        ← ferramentas do agente (leads, dossiês)
    │   └── llm/
    │       └── openrouter-client.ts  ← cliente da API OpenRouter
    ├── tests/                      ← testes unitários e de integração
    ├── filesystem/                 ← dados da investigação ativa
    │   ├── source/                 ← PDFs de entrada
    │   ├── dossier/                ← dossiês de entidades
    │   ├── investigation/          ← leads, alegações, findings
    │   ├── events/                 ← linha do tempo
    │   └── reports/                ← relatórios gerados
    └── interface/                  ← frontend React (chat UI)
        └── src/
            ├── App.tsx             ← componente raiz
            ├── hooks/              ← lógica de estado e comunicação SSE
            └── components/         ← componentes de UI
```

---

## Tech stack

| Camada | Tecnologias |
|--------|-------------|
| Backend | Node.js (HTTP nativo), TypeScript, tsx, SSE |
| LLM | OpenRouter API (Gemini, Claude, GPT, etc.) |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |
| Estado | Zustand |
| Persistência | Filesystem local (JSON + Markdown) — sem banco de dados |
