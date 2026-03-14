import type http from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { startSseStream, emit } from '../sse-emitter.js'
import { loadRoutingContext, type RoutingContext } from '../routing-context.js'
import { decideAgentRoute, planLeads, executeInquiryBatch, type AgentRouteAction } from '../../runner/run-agent.js'
import { streamDirectChat } from '../direct-chat.js'
import { appendChatTurn, DEFAULT_SESSION_ID } from '../chat-session.js'
import { SseUiFeedback } from '../../feedback/sse-ui-feedback.js'
import { runInit } from '../../runner/run-init.js'
import { runDig } from '../../runner/run-dig.js'
import { runDeepDiveNext } from '../../runner/run-deep-dive-next.js'
import { runCreateLead } from '../../runner/run-create-lead.js'
import { runInquiry } from '../../runner/run-inquiry.js'
import { runDocumentProcessingWithFeedback } from '../../runner/run-document-processing-ui.js'
import { runAgentSetup } from '../../runner/run-agent-instructions.js'
import { registerRequest, cancelMostRecentOtherThan, unregisterRequest } from '../request-registry.js'
import { waitForApproval } from '../approval-gate.js'
import { withRetry } from '../retry-handler.js'

// ─── Greeting handler ────────────────────────────────────────────────────────

interface SuggestionItem {
  id: string
  text: string
}

function buildGreetingSystemPrompt(ctx: RoutingContext): string {
  const { systemState } = ctx

  // Describe current state for the LLM
  const stateLines: string[] = []
  if (systemState.sourceEmpty) {
    stateLines.push('- Base de conhecimento: vazia (nenhum documento adicionado ainda)')
  } else {
    if (systemState.processedFiles.length > 0) {
      stateLines.push(`- Documentos processados: ${systemState.processedFiles.length} arquivo(s)`)
    }
    if (systemState.unprocessedFiles.length > 0) {
      stateLines.push(
        `- Documentos pendentes de processamento: ${systemState.unprocessedFiles.length} arquivo(s) (${systemState.unprocessedFiles.map((f) => f.fileName).join(', ')})`,
      )
    }
    if (systemState.failedFiles.length > 0) {
      stateLines.push(
        `- Documentos com falha no processamento: ${systemState.failedFiles.length} arquivo(s) (${systemState.failedFiles.map((f) => f.fileName).join(', ')})`,
      )
    }
  }

  if (systemState.hasAgentContext) {
    stateLines.push('- Contexto de investigação (agent.md): configurado')
  } else {
    stateLines.push('- Contexto de investigação (agent.md): não configurado')
  }

  if (systemState.leads.length > 0) {
    stateLines.push(`- Leads de investigação: ${systemState.leads.length} lead(s) registrado(s)`)
  } else {
    stateLines.push('- Leads de investigação: nenhum ainda')
  }

  if (systemState.isFirstVisit) {
    stateLines.push('- Esta é a primeira visita do usuário (sem histórico de conversa)')
  }

  return [
    'Você é o Reverso, um agente de investigação jornalística (OSINT).',
    'Ao receber uma saudação, apresente-se de forma clara, breve e contextual.',
    '',
    'Fluxo de investigação do Reverso (5 etapas):',
    '1. Adicionar documentos (PDFs, relatórios, contratos)',
    '2. Processar documentos → extrair textos e metadados',
    '3. Init → criar contexto de investigação (agent.md)',
    '4. Deep-dive → análise profunda, geração de leads',
    '5. Inquiry → investigar leads, gerar alegações e findings',
    '',
    'Estado atual do sistema:',
    stateLines.join('\n'),
    '',
    'Instruções para a resposta:',
    '- Adapte o idioma ao idioma da mensagem do usuário (português, inglês, etc.)',
    '- Mencione o estado atual de forma natural (ex.: se tem docs pendentes, diga que há arquivos prontos para processar)',
    '- Se source está vazio: oriente o usuário a adicionar PDFs (via sidebar ou arrasto no chat)',
    '- Se tem arquivos com falha: mencione que alguns arquivos tiveram erro e ofereça reprocessar',
    '- Se tudo ok: mostre o que está disponível e sugira o próximo passo',
    '- Seja direto e acolhedor. Máximo 3-4 parágrafos curtos.',
  ].join('\n')
}

function buildGreetingSuggestions(ctx: RoutingContext): SuggestionItem[] {
  const { systemState } = ctx
  const items: SuggestionItem[] = []

  if (systemState.sourceEmpty) {
    items.push(
      { id: 'add-docs', text: 'Como adiciono documentos?' },
      { id: 'how-it-works', text: 'Como funciona o Reverso?' },
      { id: 'what-is-osint', text: 'O que é investigação OSINT?' },
    )
    return items
  }

  if (systemState.failedFiles.length > 0) {
    items.push({ id: 'reprocess-failed', text: 'Reprocessar arquivos com erro' })
  }

  if (systemState.unprocessedFiles.length > 0) {
    items.push(
      { id: 'process-docs', text: 'Processar documentos pendentes' },
      { id: 'what-is-deepdive', text: 'O que é o deep-dive?' },
    )
    return items
  }

  if (systemState.hasPreviewsWithoutInit) {
    items.push(
      { id: 'init-context', text: 'Inicializar contexto de investigação' },
      { id: 'view-sources', text: 'Ver documentos disponíveis' },
    )
    return items
  }

  // Tudo ok — sugestões baseadas em leads
  if (systemState.leads.length > 0) {
    items.push(
      { id: 'deep-dive', text: 'Fazer deep-dive' },
      { id: 'view-leads', text: 'Ver leads existentes' },
      { id: 'create-lead', text: 'Criar lead de investigação' },
    )
  } else {
    items.push(
      { id: 'deep-dive', text: 'Fazer deep-dive' },
      { id: 'what-are-leads', text: 'O que são os leads?' },
      { id: 'view-sources', text: 'Ver fontes processadas' },
    )
  }

  return items
}

async function handleGreeting(
  text: string,
  ctx: RoutingContext,
  res: http.ServerResponse,
  sessionId: string,
): Promise<string> {
  const systemOverride = buildGreetingSystemPrompt(ctx)
  const fullText = await streamDirectChat(text, ctx, res, sessionId, { systemOverride })

  const suggestions = buildGreetingSuggestions(ctx)
  emit(res, 'suggestions', { items: suggestions })

  return fullText
}

// ─── Quick Research handler ───────────────────────────────────────────────────

const PREVIEW_MAX_CHARS = 3_000
const PREVIEW_MAX_COUNT = 5

function buildQuickResearchSystemPrompt(
  previews: { fileName: string; content: string }[],
  agentMd?: string,
): string {
  const parts: string[] = [
    'Você é o Reverso, um agente de investigação jornalística (OSINT).',
    'Responda à pergunta do usuário com base nos documentos disponíveis abaixo.',
    'Cite o documento quando relevante (ex.: "Segundo [nome do arquivo], ...").',
    'Se a informação não estiver nos documentos, diga claramente que não encontrou.',
    'Seja direto e objetivo.',
  ]

  if (agentMd) {
    parts.push(`\n## Contexto da investigação\n\n${agentMd}`)
  }

  if (previews.length > 0) {
    parts.push('\n## Documentos disponíveis para consulta\n')
    for (const preview of previews) {
      parts.push(`### ${preview.fileName}\n\n${preview.content}`)
    }
  }

  return parts.join('\n')
}

async function handleQuickResearch(
  text: string,
  ctx: RoutingContext,
  res: http.ServerResponse,
  sessionId: string,
  signal: AbortSignal,
): Promise<string> {
  const { systemState, runtime } = ctx

  // Sem previews processados → orientar usuário
  if (systemState.processedFiles.length === 0) {
    return streamDirectChat(
      `O usuário fez uma pergunta de pesquisa mas não há documentos processados ainda. ` +
        `Explique que é necessário processar os documentos primeiro para poder fazer pesquisas. ` +
        `Pergunta original: "${text}"`,
      ctx,
      res,
      sessionId,
    )
  }

  // Carregar previews (até PREVIEW_MAX_COUNT arquivos)
  const filesToLoad = systemState.processedFiles.slice(0, PREVIEW_MAX_COUNT)
  const previews: { docId: string; fileName: string; content: string }[] = []

  for (const file of filesToLoad) {
    try {
      const previewPath = path.join(runtime.paths.sourceArtifactsDir, file.docId, 'preview.md')
      const raw = await readFile(previewPath, 'utf8')
      const content =
        raw.length > PREVIEW_MAX_CHARS ? raw.slice(0, PREVIEW_MAX_CHARS) + '\n...(truncado)' : raw
      previews.push({ docId: file.docId, fileName: file.fileName, content })
      // Emitir source-reference para cada documento consultado
      emit(res, 'source-reference', { docId: file.docId, role: 'consulted', docName: file.fileName })
    } catch {
      // Preview não disponível para este arquivo — ignorar
    }
  }

  if (previews.length === 0) {
    return streamDirectChat(
      `O usuário fez uma pergunta de pesquisa mas os previews dos documentos não estão disponíveis. ` +
        `Explique que os documentos precisam ser reprocessados. Pergunta original: "${text}"`,
      ctx,
      res,
      sessionId,
    )
  }

  // Carregar agent.md para contexto de investigação
  let agentMd: string | undefined
  try {
    agentMd = await readFile(path.join(runtime.paths.outputDir, 'agent.md'), 'utf8')
  } catch {
    // Não existe ainda — ok
  }

  const systemOverride = buildQuickResearchSystemPrompt(
    previews.map((p) => ({ fileName: p.fileName, content: p.content })),
    agentMd,
  )

  const fullText = await streamDirectChat(text, ctx, res, sessionId, { systemOverride })

  // Oferecer criar/atualizar dossiê com os dados encontrados
  const gateId = randomUUID()
  emit(res, 'approval-request', {
    requestId: gateId,
    title: 'Deseja criar ou atualizar uma entrada no dossiê com essas informações?',
    description: 'As informações encontradas podem enriquecer o dossiê de investigação.',
  })

  const approved = await Promise.race([
    waitForApproval(gateId),
    new Promise<boolean>((resolve) => {
      if (signal.aborted) {
        resolve(false)
        return
      }
      signal.addEventListener('abort', () => resolve(false), { once: true })
    }),
  ])

  if (approved && !signal.aborted) {
    const confirmDelta =
      '\n\n---\n_Anotado. Use "criar dossiê de [nome da entidade]" para registrar formalmente._'
    emit(res, 'text-delta', { delta: confirmDelta, fullText: fullText + confirmDelta })
    emit(res, 'suggestions', {
      items: [
        { id: 'create-dossier', text: 'Criar entrada no dossiê para a entidade encontrada' },
        { id: 'deep-dive', text: 'Fazer deep-dive para investigar mais a fundo' },
        { id: 'create-lead', text: 'Criar um lead de investigação sobre isso' },
      ],
    })
  }

  return fullText
}

// ─── View Data handler ────────────────────────────────────────────────────────

async function listMarkdownFilenames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

function buildViewDataSystemPrompt(
  ctx: RoutingContext,
  dossierData: { people: string[]; groups: string[]; places: string[] },
  allegations: string[],
  agentMd?: string,
): string {
  const { systemState } = ctx
  const { leads } = systemState

  const parts: string[] = [
    'Você é o Reverso, um agente de investigação jornalística (OSINT).',
    'O usuário quer consultar dados existentes no sistema.',
    'Responda com base nos dados abaixo. Se não houver dados para o que foi pedido,',
    'sugira como criá-los de forma clara e direta (ex.: "Ainda não há leads — posso fazer um deep-dive para sugerir alguns.").',
  ]

  if (agentMd) {
    parts.push(`\n## Contexto da investigação (agent.md)\n\n${agentMd}`)
  }

  // Leads
  parts.push('\n## Leads de Investigação')
  if (leads.length > 0) {
    for (const lead of leads) {
      parts.push(`- **${lead.slug}**: ${lead.title} (status: ${lead.status})`)
    }
  } else {
    parts.push('- Nenhum lead registrado ainda.')
  }

  // Dossiê
  const hasDossier =
    dossierData.people.length > 0 || dossierData.groups.length > 0 || dossierData.places.length > 0
  parts.push('\n## Dossiê de Entidades')
  if (hasDossier) {
    if (dossierData.people.length > 0)
      parts.push(`- **Pessoas:** ${dossierData.people.join(', ')}`)
    if (dossierData.groups.length > 0)
      parts.push(`- **Organizações:** ${dossierData.groups.join(', ')}`)
    if (dossierData.places.length > 0)
      parts.push(`- **Lugares:** ${dossierData.places.join(', ')}`)
  } else {
    parts.push('- Dossiê vazio (nenhuma entidade registrada ainda).')
  }

  // Alegações
  parts.push('\n## Alegações')
  if (allegations.length > 0) {
    for (const allegation of allegations) {
      parts.push(`- ${allegation}`)
    }
  } else {
    parts.push('- Nenhuma alegação registrada ainda.')
  }

  // Fontes
  parts.push('\n## Fontes')
  parts.push(`- Processadas: ${systemState.processedFiles.length}`)
  parts.push(`- Pendentes de processamento: ${systemState.unprocessedFiles.length}`)
  if (systemState.failedFiles.length > 0) {
    parts.push(`- Com falha: ${systemState.failedFiles.length}`)
  }

  return parts.join('\n')
}

async function handleViewData(
  text: string,
  ctx: RoutingContext,
  res: http.ServerResponse,
  sessionId: string,
): Promise<string> {
  const { runtime, systemState } = ctx

  // Carregar dados existentes do disco em paralelo
  const [people, groups, places, allegations] = await Promise.all([
    listMarkdownFilenames(runtime.paths.dossierPeopleDir),
    listMarkdownFilenames(runtime.paths.dossierGroupsDir),
    listMarkdownFilenames(runtime.paths.dossierPlacesDir),
    listMarkdownFilenames(runtime.paths.allegationsDir),
  ])

  // Carregar agent.md
  let agentMd: string | undefined
  try {
    agentMd = await readFile(path.join(runtime.paths.outputDir, 'agent.md'), 'utf8')
  } catch {
    // Não existe ainda — ok
  }

  const systemOverride = buildViewDataSystemPrompt(
    ctx,
    { people, groups, places },
    allegations,
    agentMd,
  )

  const fullText = await streamDirectChat(text, ctx, res, sessionId, { systemOverride })

  // Sugestões contextuais ao final
  const items: SuggestionItem[] = []
  if (systemState.leads.length > 0) {
    items.push({ id: 'run-inquiry', text: 'Investigar um lead' })
    items.push({ id: 'quick-research', text: 'Pesquisar informação nos documentos' })
  } else if (systemState.processedFiles.length > 0) {
    items.push({ id: 'deep-dive', text: 'Fazer deep-dive para gerar leads' })
    items.push({ id: 'quick-research', text: 'Pesquisar informação nos documentos' })
  } else {
    items.push({ id: 'process-docs', text: 'Processar documentos para começar' })
  }

  if (items.length > 0) {
    emit(res, 'suggestions', { items })
  }

  return fullText
}

// ─── Update Agent Context handler ────────────────────────────────────────────

async function handleUpdateAgentContext(
  text: string,
  ctx: RoutingContext,
  res: http.ServerResponse,
  sessionId: string,
  signal: AbortSignal,
): Promise<string> {
  const feedback = new SseUiFeedback(res)

  // Sem agent.md: precisa fazer init primeiro
  if (!ctx.systemState.hasAgentContext) {
    return streamDirectChat(
      `O usuário disse: "${text}". Explique que é necessário primeiro fazer o init (inicializar o contexto de investigação) antes de poder atualizar o agent.md. Sugira digitar "inicializar contexto" ou "init".`,
      ctx,
      res,
      sessionId,
    )
  }

  // Pedir confirmação antes de modificar agent.md
  const gateId = randomUUID()
  const preview = text.length > 80 ? `${text.slice(0, 80)}...` : text
  emit(res, 'approval-request', {
    requestId: gateId,
    title: 'Atualizar contexto de investigação (agent.md)?',
    description: `A instrução "${preview}" será adicionada ao agent.md como instrução ativa.`,
  })

  const approved = await Promise.race([
    waitForApproval(gateId),
    new Promise<boolean>((resolve) => {
      if (signal.aborted) { resolve(false); return }
      signal.addEventListener('abort', () => resolve(false), { once: true })
    }),
  ])

  if (!approved || signal.aborted) {
    const msg = '_Atualização cancelada. O agent.md não foi modificado._'
    emit(res, 'text-delta', { delta: msg, fullText: msg })
    return msg
  }

  // Executar atualização do agent.md
  try {
    await runAgentSetup({ text, feedback })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit(res, 'error', { message: `Erro ao atualizar agent.md: ${message}` })
    return feedback.getFullText()
  }

  // Emitir artifact com conteúdo atualizado
  try {
    const agentMdPath = path.join(ctx.runtime.paths.outputDir, 'agent.md')
    const content = await readFile(agentMdPath, 'utf8')
    emit(res, 'artifact', { title: 'agent.md', content, path: 'agent.md', language: 'markdown' })
  } catch {
    // Não fatal — artifact indisponível momentaneamente
  }

  // Sugestões contextuais após atualização
  emit(res, 'suggestions', {
    items: [
      { id: 'deep-dive', text: 'Fazer deep-dive com o novo contexto' },
      { id: 'quick-research', text: 'Pesquisar informação nos documentos' },
      { id: 'create-lead', text: 'Criar lead de investigação' },
    ],
  })

  return feedback.getFullText()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

/** Intents que requerem dados de source para funcionar */
const INTENTS_NEEDING_DATA = new Set<AgentRouteAction['kind']>([
  'init',
  'deep_dive',
  'deep_dive_next',
  'create_lead',
  'plan_leads',
  'execute_inquiry',
  'quick_research',
])

function needsData(kind: AgentRouteAction['kind']): boolean {
  return INTENTS_NEEDING_DATA.has(kind)
}

interface QueueStep {
  id: string
  label: string
}

type QueuedOperation =
  | { kind: 'process_documents' }
  | { kind: 'init' }
  | { kind: 'original_intent'; route: AgentRouteAction }

function queueStepLabel(op: QueuedOperation): string {
  if (op.kind === 'process_documents') return 'Processar documentos'
  if (op.kind === 'init') return 'Inicializar contexto de investigação'
  return 'Executar operação principal'
}

// ─── Runner executor (single step, via SseUiFeedback) ────────────────────────

async function executeRunner(
  route: AgentRouteAction,
  ctx: RoutingContext,
  res: http.ServerResponse,
): Promise<string> {
  const feedback = new SseUiFeedback(res)

  if (route.kind === 'init') {
    await runInit({
      model: ctx.runtime.model,
      responseLanguage: ctx.runtime.responseLanguage,
      artifactLanguage: ctx.runtime.artifactLanguage,
      feedback,
    })
    emit(res, 'suggestions', {
      items: [
        { id: 'deep-dive', text: 'Explorar as fontes com deep-dive' },
        { id: 'quick-research', text: 'Pesquisar informação nos documentos' },
        { id: 'what-next', text: 'O que você quer investigar?' },
      ],
    })
  } else if (route.kind === 'deep_dive') {
    await runDig({
      model: ctx.runtime.model,
      responseLanguage: ctx.runtime.responseLanguage,
      enablePev: ctx.runtime.enablePev,
      selfRepairEnabled: ctx.runtime.selfRepairEnabled,
      selfRepairMaxRounds: ctx.runtime.selfRepairMaxRounds,
      feedback,
    })
  } else if (route.kind === 'deep_dive_next') {
    // deep_dive_next requires text — not available here; handled separately
    feedback.systemInfo('deep_dive_next não suportado em fila — executando normalmente.')
  } else if (route.kind === 'create_lead') {
    await runCreateLead({
      ...(route.idea ? { idea: route.idea } : {}),
      model: ctx.runtime.model,
      responseLanguage: ctx.runtime.responseLanguage,
      enablePev: ctx.runtime.enablePev,
      selfRepairEnabled: ctx.runtime.selfRepairEnabled,
      selfRepairMaxRounds: ctx.runtime.selfRepairMaxRounds,
      feedback,
      waitForApproval,
    })
  } else if (route.kind === 'plan_leads') {
    await planLeads({
      leads: route.leads,
      runtime: {
        model: ctx.runtime.model,
        responseLanguage: ctx.runtime.responseLanguage,
        selfRepairEnabled: ctx.runtime.selfRepairEnabled,
        selfRepairMaxRounds: ctx.runtime.selfRepairMaxRounds,
        apiKey: ctx.runtime.apiKey,
        paths: ctx.runtime.paths,
      },
      feedback,
    })
    feedback.summary('Planejamento concluido', [
      `Inquiry Plan atualizado para ${route.leads.length} lead(s).`,
      'Proximo passo: diga "pode fazer a investigacao dos leads" para executar inquiry.',
    ])
  } else if (route.kind === 'execute_inquiry') {
    const draftLeads = route.leads.filter((lead) => lead.status === 'draft')
    if (route.autoPlanDrafts && draftLeads.length > 0) {
      feedback.stepStart('auto-plan-drafts', 'Leads em draft detectados: gerando Inquiry Plan antes da execucao...')
      await planLeads({
        leads: draftLeads,
        runtime: {
          model: ctx.runtime.model,
          responseLanguage: ctx.runtime.responseLanguage,
          selfRepairEnabled: ctx.runtime.selfRepairEnabled,
          selfRepairMaxRounds: ctx.runtime.selfRepairMaxRounds,
          apiKey: ctx.runtime.apiKey,
          paths: ctx.runtime.paths,
        },
        feedback,
      })
    }

    const runOneLead = async (leadSlug: string): Promise<void> => {
      await runInquiry({
        lead: leadSlug,
        model: ctx.runtime.model,
        responseLanguage: ctx.runtime.responseLanguage,
        enablePev: ctx.runtime.enablePev,
        selfRepairEnabled: ctx.runtime.selfRepairEnabled,
        selfRepairMaxRounds: ctx.runtime.selfRepairMaxRounds,
        feedback,
      })
    }
    const batchResult = await executeInquiryBatch({
      leads: route.leads.map((lead) => lead.slug),
      runOne: runOneLead,
    })
    const { succeededLeads, failedLeads } = batchResult
    for (const failure of failedLeads) {
      feedback.systemWarn(`Inquiry falhou para lead ${failure.slug}: ${failure.message}`)
    }
    feedback.summary(
      failedLeads.length > 0
        ? 'Execucao de inquiry concluida com falhas parciais'
        : 'Execucao de inquiry concluida',
      [
        `Leads solicitados: ${route.leads.length}.`,
        `Sucesso: ${succeededLeads.length}.`,
        `Falhas: ${failedLeads.length}.`,
      ],
    )
    emit(res, 'suggestions', {
      items: [
        { id: 'verify-findings', text: 'Verificar os findings nas fontes originais' },
        { id: 'new-deep-dive', text: 'Fazer um novo deep-dive' },
        { id: 'propose-hypothesis', text: 'Propor novas hipóteses de investigação' },
      ],
    })
  }

  return feedback.getFullText()
}

// ─── Queue executor ──────────────────────────────────────────────────────────

async function executeQueue(
  ops: QueuedOperation[],
  queueId: string,
  steps: QueueStep[],
  ctx: RoutingContext,
  res: http.ServerResponse,
  signal: AbortSignal,
  text: string,
  sessionId: string,
): Promise<string> {
  let fullText = ''

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!
    const step = steps[i]!

    // Verificar abort antes de cada step
    if (signal.aborted) {
      emit(res, 'queue-abort', { queueId, reason: 'Cancelado pelo usuário', stepId: step.id })
      return fullText
    }

    emit(res, 'queue-step-update', { queueId, stepId: step.id, status: 'running' })

    try {
      await withRetry(
        async () => {
          if (op.kind === 'process_documents') {
            // Processar todos os documentos não processados com feedback SSE por arquivo
            const feedback = new SseUiFeedback(res)
            await runDocumentProcessingWithFeedback(feedback, ctx.runtime, signal)
            fullText += feedback.getFullText()
          } else if (op.kind === 'init') {
            const feedback = new SseUiFeedback(res)
            await runInit({
              model: ctx.runtime.model,
              responseLanguage: ctx.runtime.responseLanguage,
              artifactLanguage: ctx.runtime.artifactLanguage,
              feedback,
            })
            fullText += feedback.getFullText()
          } else if (op.kind === 'original_intent') {
            // Reload context pois o estado mudou (processou docs, fez init)
            const freshCtx = await loadRoutingContext()
            if (op.route.kind === 'greeting') {
              fullText += await handleGreeting(text, freshCtx, res, sessionId)
            } else if (op.route.kind === 'quick_research') {
              fullText += await handleQuickResearch(text, freshCtx, res, sessionId, signal)
            } else if (op.route.kind === 'view_data') {
              fullText += await handleViewData(text, freshCtx, res, sessionId)
            } else if (
              op.route.kind === 'general_chat' ||
              op.route.kind === 'update_agent_context' ||
              op.route.kind === 'process_documents' ||
              op.route.kind === 'abort'
            ) {
              fullText += await streamDirectChat(text, freshCtx, res, sessionId)
            } else {
              fullText += await executeRunner(op.route, freshCtx, res)
            }
          }
        },
        signal,
        (retryInfo) => {
          emit(res, 'retry', {
            attempt: retryInfo.attempt,
            maxAttempts: retryInfo.maxAttempts,
            delaySec: retryInfo.delaySec,
            errorSnippet: retryInfo.errorSnippet,
          })
        },
      )

      emit(res, 'queue-step-update', { queueId, stepId: step.id, status: 'done' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)

      if (signal.aborted || message.includes('Aborted')) {
        emit(res, 'queue-abort', { queueId, reason: 'Cancelado pelo usuário', stepId: step.id })
        return fullText
      }

      emit(res, 'queue-step-update', { queueId, stepId: step.id, status: 'error' })
      emit(res, 'error', { message: `Falha no step "${step.label}": ${message}` })
      // Encerrar a fila se um step falhar após retries
      return fullText
    }
  }

  return fullText
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function handleChat(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  let text = ''
  let sessionId = DEFAULT_SESSION_ID
  try {
    const raw = await readBody(req)
    const body = JSON.parse(raw) as Record<string, unknown>
    if (typeof body['text'] === 'string') {
      text = body['text']
    }
    if (typeof body['sessionId'] === 'string' && body['sessionId']) {
      sessionId = body['sessionId']
    }
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid JSON body' }))
    return
  }

  if (!text.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'text is required' }))
    return
  }

  // Registrar request e obter AbortController
  const requestId = randomUUID()
  const abortController = registerRequest(requestId)
  const signal = abortController.signal

  startSseStream(res)

  // 1. Routing phase — inclui requestId para o frontend rastrear
  emit(res, 'status', { phase: 'routing', label: 'Analisando intenção...', requestId })

  let route: AgentRouteAction
  let ctx: RoutingContext
  try {
    ctx = await loadRoutingContext()
    route = await decideAgentRoute({
      text,
      ...(ctx.session ? { session: ctx.session } : {}),
      hasAgentContext: ctx.hasAgentContext,
      leads: ctx.leads,
      model: ctx.runtime.model,
      apiKey: ctx.runtime.apiKey,
      systemState: ctx.systemState,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit(res, 'error', { message: `Erro no roteamento: ${message}` })
    emit(res, 'status', { phase: 'idle', label: '' })
    emit(res, 'done', { messageId: randomUUID() })
    res.end()
    unregisterRequest(requestId)
    return
  }

  // 2. Route decision
  emit(res, 'route-decision', {
    intent: route.kind,
    route: route.kind,
    reason: route.reason,
    confidence: 1.0,
  })

  // 3. Abort verbal ("para", "cancela")
  if (route.kind === 'abort') {
    const cancelledId = cancelMostRecentOtherThan(requestId)
    emit(res, 'abort-ack', { requestId: cancelledId ?? requestId })
    emit(res, 'status', { phase: 'idle', label: '' })
    emit(res, 'done', { messageId: randomUUID() })
    res.end()
    unregisterRequest(requestId)
    return
  }

  // 4. Start streaming phase
  if (route.kind === 'process_documents') {
    emit(res, 'status', { phase: 'streaming-llm', label: 'Processando documentos...' })
  } else {
    emit(res, 'status', { phase: 'streaming-llm', label: 'Gerando resposta...' })
  }

  // 5. Pré-routing state-aware: stubs e rotas diretas não precisam de pré-check
  const isDirectRoute = route.kind === 'general_chat'

  if (route.kind === 'update_agent_context') {
    const fullText = await handleUpdateAgentContext(text, ctx, res, sessionId, signal)
    await finalize(res, res, requestId, sessionId, text, fullText)
    return
  }

  if (route.kind === 'greeting') {
    const fullText = await handleGreeting(text, ctx, res, sessionId)
    await finalize(res, res, requestId, sessionId, text, fullText)
    return
  }

  if (route.kind === 'quick_research') {
    const fullText = await handleQuickResearch(text, ctx, res, sessionId, signal)
    await finalize(res, res, requestId, sessionId, text, fullText)
    return
  }

  if (route.kind === 'view_data') {
    const fullText = await handleViewData(text, ctx, res, sessionId)
    await finalize(res, res, requestId, sessionId, text, fullText)
    return
  }

  if (route.kind === 'process_documents') {
    const feedback = new SseUiFeedback(res)
    await runDocumentProcessingWithFeedback(feedback, ctx.runtime, signal)
    await finalize(res, res, requestId, sessionId, text, feedback.getFullText())
    return
  }

  if (isDirectRoute) {
    const fullText = await streamDirectChat(text, ctx, res, sessionId)
    await finalize(res, res, requestId, sessionId, text, fullText)
    return
  }

  // 6. Pré-checks state-aware (apenas para rotas agênticas que precisam de dados)
  const { systemState } = ctx
  const queue: QueuedOperation[] = []

  if (needsData(route.kind)) {
    // Fonte de dados vazia → orientar upload (sem fila)
    if (systemState.sourceEmpty) {
      const orientationText = await streamDirectChat(
        `O usuário quer fazer "${route.kind}" mas não há documentos na base de conhecimento. ` +
        'Explique que é necessário adicionar PDFs primeiro (via sidebar ou arrastar arquivos no chat). ' +
        `A mensagem original do usuário foi: "${text}"`,
        ctx,
        res,
        sessionId,
      )
      await finalize(res, res, requestId, sessionId, text, orientationText)
      return
    }

    // Há PDFs não processados → pedir aprovação para processar antes
    if (systemState.unprocessedFiles.length > 0) {
      const gateId = randomUUID()
      const fileNames = systemState.unprocessedFiles.map((f) => f.fileName).join(', ')
      emit(res, 'approval-request', {
        requestId: gateId,
        title: `Há ${systemState.unprocessedFiles.length} arquivo(s) não processado(s). Processar antes de continuar?`,
        description: fileNames,
      })

      // Aguardar aprovação (ou abort)
      const approved = await Promise.race([
        waitForApproval(gateId),
        new Promise<boolean>((resolve) => {
          if (signal.aborted) {
            resolve(false)
            return
          }
          signal.addEventListener('abort', () => resolve(false), { once: true })
        }),
      ])

      if (signal.aborted) {
        emit(res, 'abort-ack', { requestId })
        emit(res, 'status', { phase: 'idle', label: '' })
        emit(res, 'done', { messageId: randomUUID() })
        res.end()
        unregisterRequest(requestId)
        return
      }

      if (approved) {
        queue.push({ kind: 'process_documents' })
      }
    }

    // Tem previews mas não tem agent.md → init automático antes
    if (systemState.hasPreviewsWithoutInit && route.kind !== 'init') {
      queue.push({ kind: 'init' })
    }
  }

  // Adicionar o intent original à fila
  queue.push({ kind: 'original_intent', route })

  // 7. Executar — fila ou step único
  let fullText: string

  if (queue.length > 1) {
    const queueId = randomUUID()
    const steps: QueueStep[] = queue.map((op, i) => ({
      id: `step-${i}`,
      label: queueStepLabel(op),
    }))

    emit(res, 'queue-start', {
      queueId,
      steps: steps.map((s) => ({ id: s.id, label: s.label, status: 'pending' })),
    })

    fullText = await executeQueue(queue, queueId, steps, ctx, res, signal, text, sessionId)
  } else {
    // Step único — comportamento original
    try {
      fullText = await withRetry(
        () => executeRunner(route, ctx, res),
        signal,
        (retryInfo) => {
          emit(res, 'retry', {
            attempt: retryInfo.attempt,
            maxAttempts: retryInfo.maxAttempts,
            delaySec: retryInfo.delaySec,
            errorSnippet: retryInfo.errorSnippet,
          })
        },
      )
    } catch (err) {
      if (!signal.aborted) {
        const message = err instanceof Error ? err.message : String(err)
        emit(res, 'error', { message })
      } else {
        emit(res, 'abort-ack', { requestId })
      }
      fullText = ''
    }
  }

  await finalize(res, res, requestId, sessionId, text, fullText)
}

// ─── Finalize (stream close + persist) ──────────────────────────────────────

async function finalize(
  _res: http.ServerResponse,
  res: http.ServerResponse,
  requestId: string,
  sessionId: string,
  text: string,
  fullText: string,
): Promise<void> {
  const messageId = randomUUID()
  const userTimestamp = new Date().toISOString()
  const assistantTimestamp = new Date().toISOString()

  emit(res, 'text-done', { fullText })
  emit(res, 'status', { phase: 'idle', label: '' })
  emit(res, 'done', { messageId })
  res.end()

  unregisterRequest(requestId)

  appendChatTurn(
    sessionId,
    { id: randomUUID(), role: 'user', text, timestamp: userTimestamp },
    { id: messageId, role: 'assistant', text: fullText, timestamp: assistantTimestamp },
  ).catch((err: unknown) => {
    console.error('[agent-server] Failed to persist chat turn:', err)
  })
}
