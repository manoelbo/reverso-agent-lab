# Source (ambiente de teste)

Esta pasta é um **ambiente de teste** de como funcionará a pasta de fontes (sources) no Reverso Agent.

## Uso

Coloque aqui os arquivos (ex.: PDFs) que deseja processar.

- Da raiz do projeto, use o comando integrado ao agent:

  ```bash
  pnpm lab:source:process-all
  ```

  Ou com parâmetros explícitos:

  ```bash
  pnpm reverso doc-process process-all --source lab/agent/filesystem/source
  ```

## Exemplo (PDF único)

```bash
pnpm reverso doc-process --input "examples/input/meu-documento.pdf" --output "examples/output" --chunk-pages 5 --concurrency 15
```

Quando o workspace real do Reverso estiver ativo, a pasta de fontes seguirá a mesma ideia: um local único onde o usuário deposita documentos para ingestão e processamento (réplica, preview, metadata).
