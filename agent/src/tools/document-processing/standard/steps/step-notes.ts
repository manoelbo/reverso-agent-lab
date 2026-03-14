import { callWithCache, type CacheContext } from '../cache-context.js'
import { OpenRouterClient } from '../../openrouter-client.js'
import {
  STANDARD_NOTES_SYSTEM_PROMPT,
  STANDARD_NOTES_USER_PROMPT
} from '../prompts.js'
import { extractJsonArray, repairTruncatedJsonArray } from '../../../../core/markdown.js'
import type { NoteItem, NoteCategory } from '../../../../core/contracts.js'
import type { OpenRouterUsage } from '../../types.js'

export interface StepNotesParams {
  ctx: CacheContext
  sourceFileName: string
  artifactLanguageInstruction?: string
  client: OpenRouterClient
  timeoutMs?: number
}

export interface StepNotesResult {
  notes: NoteItem[]
  notesCount: number
  usage: OpenRouterUsage
}

interface RawNoteExtraction {
  category: string
  page: number
  highlight: string
  description: string
  tags: string[]
}

function isValidCategory(c: string): c is NoteCategory {
  return c === 'CLAIM' || c === 'RED_FLAG' || c === 'DISCREPANCY'
}

/**
 * Etapa 3: extrai Notes investigativas (CLAIM, RED_FLAG, DISCREPANCY) do documento.
 * Mantem as notes em memoria para consolidacao no preview.md no pos-processamento.
 */
export async function runStepNotes(params: StepNotesParams): Promise<StepNotesResult> {
  const { content, usage } = await callWithCache(
    params.ctx,
    params.client,
    STANDARD_NOTES_SYSTEM_PROMPT,
    [STANDARD_NOTES_USER_PROMPT, params.artifactLanguageInstruction].filter(Boolean).join("\n\n"),
    params.timeoutMs ?? 120_000,
    8192
  )

  let rawNotes: RawNoteExtraction[] = []
  try {
    const extracted = extractJsonArray(content)
    rawNotes = JSON.parse(extracted) as RawNoteExtraction[]
    if (!Array.isArray(rawNotes)) rawNotes = []
  } catch {
    // Tenta reparar JSON truncado: remove o ultimo objeto incompleto e fecha o array
    try {
      const extracted = extractJsonArray(content)
      const repaired = repairTruncatedJsonArray(extracted)
      rawNotes = JSON.parse(repaired) as RawNoteExtraction[]
      if (!Array.isArray(rawNotes)) rawNotes = []
      console.log(`  [step-notes] JSON reparado: ${rawNotes.length} notes extraidas.`)
    } catch (repairErr) {
      console.warn('  [step-notes] Falha ao parsear e reparar JSON de notes:', String(repairErr))
      rawNotes = []
    }
  }

  const notes: NoteItem[] = []
  const now = new Date().toISOString()

  for (const raw of rawNotes) {
    const category = isValidCategory(raw.category) ? raw.category : 'CLAIM'
    const note: NoteItem = {
      category,
      source: params.sourceFileName,
      page: raw.page ?? 0,
      highlight: (raw.highlight ?? '').slice(0, 500),
      description: raw.description ?? '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      status: 'unverified',
      createdAt: now
    }
    notes.push(note)
  }

  return { notes, notesCount: notes.length, usage }
}
