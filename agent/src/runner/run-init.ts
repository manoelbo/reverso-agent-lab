import fs from 'node:fs'
import path from 'node:path'
import { resolveRuntimeConfig } from '../config/env.js'
import { ensureDir, loadRandomPreviewsWithinBudget, writeUtf8 } from '../core/fs-io.js'
import { formatFrontmatter } from '../core/markdown.js'
import { toRelative } from '../core/paths.js'
import { OpenRouterClient } from '../llm/openrouter-client.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'
import { buildInitSystemPrompt } from '../prompts/init.js'
import {
  buildResponseLanguageInstruction,
  resolveResponseLanguage
} from '../core/language.js'

export interface RunInitOptions {
  maxTokens?: number
  model?: string
  responseLanguage?: string
  artifactLanguage?: string
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
}

const DEFAULT_MAX_TOKENS = 20_000

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function runInit(options: RunInitOptions = {}): Promise<void> {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
  const runtime = await resolveRuntimeConfig({
    ...(options.model ? { model: options.model } : {}),
    ...(options.responseLanguage ? { responseLanguage: options.responseLanguage } : {}),
    ...(options.artifactLanguage ? { artifactLanguage: options.artifactLanguage } : {})
  })
  await ensureDir(runtime.paths.outputDir)
  await ensureDir(runtime.paths.eventsDir)
  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'init',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))

  const agentPath = path.join(runtime.paths.outputDir, 'agent.md')
  const isReInit = await fileExists(agentPath)

  if (isReInit) {
    feedback.stepStart('init-start', 'Atualizando contexto de investigação...')
  } else {
    feedback.stepStart('init-start', 'Iniciando agente Reverso...')
  }
  feedback.stepComplete('init-start')
  feedback.stepStart('load-previews', `Lendo previews em ${runtime.paths.sourceArtifactsDir}`, `max ${maxTokens} tokens`)
  const result = await loadRandomPreviewsWithinBudget(
    runtime.paths.sourceArtifactsDir,
    runtime.paths.sourceDir,
    maxTokens
  )

  if (result.previews.length === 0) {
    throw new Error(
      `Nenhum preview encontrado em ${runtime.paths.sourceArtifactsDir}. Candidatos: ${result.candidatesCount}. Verifique se existem pastas com preview.md.`
    )
  }

  feedback.stepComplete('load-previews', `${result.usedCount} previews — ${result.estimatedTokens} tokens estimados`)
  feedback.stepStart('gen-understanding', 'Gerando entendimento inicial da investigacao...')
  const userParts = result.previews.map(
    (p) => `## Documento: ${p.documentName}\n\n${p.content}`
  )
  const userPrompt = userParts.join('\n\n---\n\n')

  const client = new OpenRouterClient(runtime.apiKey)
  const responseLanguage = resolveResponseLanguage({
    mode: runtime.responseLanguage,
    fallback: runtime.defaultResponseLanguage
  })
  const initSystemPrompt = buildInitSystemPrompt(buildResponseLanguageInstruction(responseLanguage))
  const understanding = await client.chatTextStream({
    model: runtime.model,
    system: initSystemPrompt,
    user: userPrompt,
    temperature: 0.2,
    onChunk(delta) {
      feedback.textDelta(delta)
    }
  })
  feedback.stepComplete('gen-understanding', 'Entendimento inicial concluido')
  feedback.stepStart('save-agent', isReInit ? 'Atualizando arquivo de contexto do agente' : 'Salvando arquivo de configuracao do agente')
  const previewList = result.previews.map((p) => `- ${p.documentName} (${p.docId})`).join('\n')
  const agentContent = [
    formatFrontmatter({
      type: 'agent_config',
      updated: new Date().toISOString(),
      previews_used: result.usedCount,
      estimated_tokens: result.estimatedTokens
    }),
    '',
    understanding.trim(),
    '',
    '## Previews usados nesta sessao',
    '',
    previewList,
    ''
  ].join('\n')

  await writeUtf8(agentPath, agentContent)

  const relPath = toRelative(runtime.paths.projectRoot, agentPath)

  // Emitir o arquivo como artifact para exibição na interface
  feedback.artifact?.({
    title: 'agent.md',
    content: agentContent,
    language: 'markdown',
    path: relPath,
  })

  feedback.fileCreated(relPath, agentContent.split('\n').length, 'agent.md criado com contexto inicial e instrucoes.')
  feedback.stepComplete('save-agent', relPath)

  // Texto explicativo sobre o agent.md
  const actionVerb = isReInit ? 'atualizado' : 'criado'
  const explanatoryText = [
    '',
    `O **agent.md** foi ${actionVerb} com base em ${result.usedCount} documento(s) analisado(s).`,
    'Ele serve como contexto de investigação: registra o entendimento inicial das fontes e orienta as próximas etapas.',
    '',
    'Para atualizar o contexto verbalmente, basta dizer algo como:',
    '*"Estou investigando corrupção no ministério X"* ou *"Adicione que o foco é contratos superfaturados"*.',
    '',
    'Também é possível reinicializar a qualquer momento com o comando `/init`.',
  ].join('\n')

  const separator = feedback.getFullText().length > 0 ? '\n\n' : ''
  feedback.textDelta(separator + explanatoryText)

  // Sugestões dinâmicas de próximo passo
  feedback.suggestions?.([
    { id: 'deep-dive', text: 'Fazer deep-dive nas fontes' },
    { id: 'explore-sources', text: 'Ver documentos disponíveis' },
    { id: 'update-context', text: 'Adicionar mais contexto à investigação' },
  ])

  if (ownsFeedback) {
    await feedback.flush()
  }
}
