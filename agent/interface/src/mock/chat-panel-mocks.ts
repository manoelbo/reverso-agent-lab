export const scenarioIntro = {
  assistant:
    "Posso iniciar um deep-dive no dossie de infraestrutura e montar um plano PEV (plan -> execute -> verify).",
  suggestions: [
    "Resuma os fatos centrais do caso",
    "Quais gaps de evidencia temos agora?",
    "Crie um plano de inquiry em 5 passos",
    "Liste riscos de compliance antes de escrever",
  ],
  user:
    "Quero abrir a investigacao sobre o contrato 019/2024 e mapear entidades relacionadas.",
}

export const scenarioPlan = {
  planDescription:
    "Planejamento editorial para abrir inquiry com rastreabilidade completa, seguindo evidence gate e validacao pre-write.",
  planTitle: "Inquiry: Contrato 019/2024",
  queueMessages: [
    "Extrair entidades e datas do preview.md",
    "Cruzar eventos do dossie com allegations em aberto",
  ],
  queueTodos: [
    "Validar consistencia entre timeline e findings",
    "Gerar sumario executivo para redacao",
  ],
  reasoning:
    "Vou dividir a execucao em tres etapas: (1) consolidar contexto factual, (2) testar hipoteses com evidencias verificaveis, (3) produzir saida editorial com incertezas explicitas.",
}

export const scenarioExecution = {
  generatedMarkdown: `## Findings preliminares

- O contrato 019/2024 teve aditivo em janela temporal coincidente com mudanca de escopo.
- Existem lacunas de evidencia primaria para duas alegacoes centrais.

### Proxima acao
Gerar checklist de verificacao independente antes de consolidar o relatorio final.`,
  jsxPreview: `<div className="rounded-lg border bg-card p-4">
  <h3 className="text-sm font-semibold">Painel de Evidencias</h3>
  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
    <li>3 fontes primarias validadas</li>
    <li>2 alegacoes com risco medio</li>
    <li>1 finding bloqueado por evidencia insuficiente</li>
  </ul>
</div>`,
  sources: [
    {
      href: "https://www.portaltransparencia.gov.br",
      title: "Portal da Transparencia",
    },
    { href: "https://dados.gov.br", title: "Dados Abertos Brasil" },
    {
      href: "https://www.gov.br/cgu/pt-br",
      title: "CGU - Referencias de Controle",
    },
  ],
  toolInput: {
    mode: "deep",
    sourcePath: "lab/agent/filesystem/source/contrato-019-2024.pdf",
  },
  toolOutput: {
    artifacts: ["preview.md", "metadata.md", "index.md"],
    status: "success",
  },
}

export const scenarioFailure = {
  stackTrace: `TypeError: Cannot read properties of undefined (reading 'content')
    at buildFindingSummary (/lab/agent/src/core/inquiry.ts:184:17)
    at runInquiryStage (/lab/agent/src/core/inquiry.ts:262:9)
    at async executePlan (/lab/agent/src/core/orchestration.ts:119:5)
    at async main (/lab/agent/src/index.ts:88:3)`,
  terminalOutput: `+------------------------------+
| STEP RUNNING                 |
| inquiry execute              |
+------------------------------+
+------------------------------+
| TOOL CALL                    |
| read_file | finding-template |
+------------------------------+
+------------------------------+
| TOOL RESULT ERROR            |
| read_file | ENOENT           |
+------------------------------+`,
  toolError: "runtime_exception: template de finding nao encontrado",
}

export const scenarioFullCycle = {
  finalSummary: [
    "Objetivo parcial atingido com evidencias suficientes para 2/3 alegacoes.",
    "1 alegacao foi pausada por insuficiencia de evidencia primaria.",
    "Recomendado novo ciclo de coleta antes de consolidar relatorio.",
  ],
  loopReasoning:
    "O loop PEV fechou com verify parcial. Mantive apenas fatos rastreaveis e marquei explicitamente os gaps para evitar overclaiming editorial.",
}

export const footerContext = {
  maxTokens: 128_000,
  usedTokens: 41_200,
  usage: {
    cachedInputTokens: 2_300,
    inputTokens: 28_000,
    outputTokens: 9_700,
    reasoningTokens: 1_200,
    totalTokens: 41_200,
  },
}
