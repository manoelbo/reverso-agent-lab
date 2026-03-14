import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { resolveRuntimeConfig } from '../config/env.js'
import { writeUtf8 } from '../core/fs-io.js'
import { toRelative } from '../core/paths.js'
import type { UiFeedbackController } from '../feedback/ui-feedback.js'
import { createFeedbackController, type FeedbackMode } from '../cli/renderer.js'

const SECTION_HISTORY = '## Historico de instrucoes'
const SECTION_ACTIVE = '## Instrucoes ativas'

export interface RunAgentSetupOptions {
  text: string
  feedbackMode?: FeedbackMode
  feedback?: UiFeedbackController
}

function ensureNewline(s: string): string {
  return s.endsWith('\n') ? s : `${s}\n`
}

export async function runAgentSetup(options: RunAgentSetupOptions): Promise<void> {
  const instruction = options.text.trim()
  if (!instruction) {
    throw new Error('Forneca o texto da instrucao com --text "..."')
  }

  const runtime = await resolveRuntimeConfig()
  const ownsFeedback = !options.feedback
  const feedback =
    options.feedback ??
    (await createFeedbackController({
      eventsDir: runtime.paths.eventsDir,
      sessionName: 'agent-setup',
      ...(options.feedbackMode ? { mode: options.feedbackMode } : {})
    }))
  feedback.stepStart('update-instructions', 'Atualizando instrucoes em filesystem/agent.md')
  const agentPath = path.join(runtime.paths.outputDir, 'agent.md')

  let content: string
  try {
    content = await readFile(agentPath, 'utf8')
  } catch {
    throw new Error(`Arquivo nao encontrado: ${agentPath}. Execute primeiro: pnpm reverso init`)
  }

  const now = new Date().toISOString()
  const historyLine = `- ${now}: ${instruction}`

  if (content.includes(SECTION_HISTORY)) {
    const afterHistory = content.indexOf(SECTION_HISTORY) + SECTION_HISTORY.length
    const nextSection = content.indexOf('\n## ', afterHistory)
    const insertPos = nextSection === -1 ? content.length : nextSection
    content =
      content.slice(0, insertPos) +
      '\n' +
      historyLine +
      '\n' +
      content.slice(insertPos)
  } else {
    content = ensureNewline(content) + `\n${SECTION_HISTORY}\n\n${historyLine}\n`
  }

  if (content.includes(SECTION_ACTIVE)) {
    const afterActive = content.indexOf(SECTION_ACTIVE) + SECTION_ACTIVE.length
    const nextSection = content.indexOf('\n## ', afterActive)
    const endOfSection = nextSection === -1 ? content.length : nextSection
    const before = content.slice(0, endOfSection)
    const after = content.slice(endOfSection)
    const activeContent = content.slice(afterActive, endOfSection).trim()
    const newActiveContent = activeContent
      ? `${activeContent}\n- ${instruction}`
      : `- ${instruction}`
    content = before + '\n\n' + newActiveContent + '\n' + after
  } else {
    content = ensureNewline(content) + `\n${SECTION_ACTIVE}\n\n- ${instruction}\n`
  }

  await writeUtf8(agentPath, content)
  const relPath = toRelative(runtime.paths.projectRoot, agentPath)
  feedback.fileEdited(relPath, 2, 0)
  feedback.stepComplete('update-instructions', relPath)
  feedback.summary('Atualizacao concluida', [
    'Historico de instrucoes atualizado.',
    'Instrucoes ativas atualizadas para os proximos ciclos.'
  ])
  if (ownsFeedback) {
    await feedback.flush()
  }
}
