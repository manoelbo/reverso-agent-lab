import { readFile, writeFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { basename } from 'node:path'
import { OpenRouterClient } from '../openrouter-client.js'
import { mergeUsage } from '../lib/merge-usage.js'
import type { OpenRouterUsage } from '../types.js'
import type { NoteItem } from '../../../core/contracts.js'
import { runStepPreview } from './steps/step-preview.js'
import { runStepIndex } from './steps/step-index.js'
import { runStepNotes } from './steps/step-notes.js'
import { runStepPersons } from './steps/step-persons.js'
import { runStepGroups } from './steps/step-groups.js'
import { runStepPlaces } from './steps/step-places.js'
import { runStepEvents } from './steps/step-events.js'
import { runStepPostprocess } from './steps/step-postprocess.js'
import type { CacheContext } from './cache-context.js'
import {
  buildArtifactLanguageInstruction,
  type ArtifactLanguage
} from '../../../core/language.js'

const DEFAULT_MODEL = 'google/gemini-2.0-flash-lite-001'

export type StepName = 'preview' | 'index' | 'notes' | 'persons' | 'groups' | 'places' | 'events' | 'postprocess'
export type StepStatus = 'pending' | 'done' | 'failed'

export interface StandardProcessCheckpoint {
  version: 1
  sourceFile: string
  model: string
  steps: Record<StepName, StepStatus>
  artifacts: {
    notes: NoteItem[]
    personsCreated: string[]
    personsUpdated: string[]
    groupsCreated: string[]
    groupsUpdated: string[]
    placesCreated: string[]
    placesUpdated: string[]
    eventsPaths: string[]
  }
  usage: OpenRouterUsage
  startedAt: string
  updatedAt: string
}

export interface StandardProcessParams {
  pdfPath: string
  artifactDir: string
  dossierPeopleDir: string
  dossierGroupsDir: string
  dossierPlacesDir: string
  dossierTimelineDir: string
  apiKey: string
  model?: string
  artifactLanguage?: ArtifactLanguage
  resume?: boolean
  parallelLimit?: number
  onStepStart?: (step: StepName) => void
  onStepDone?: (step: StepName) => void
  onStepError?: (step: StepName, err: Error) => void
  onInfo?: (message: string) => void
  onArtifact?: (input: { step: StepName; path: string; changeType: 'new' | 'edited' }) => void
}

export interface StandardProcessResult {
  usage: OpenRouterUsage
  artifacts: StandardProcessCheckpoint['artifacts']
}

const CHECKPOINT_FILENAME = 'standard-checkpoint.json'
const RETRIABLE_STATUS_CODES = [408, 429, 503, 524, 529]

function initialSteps(): Record<StepName, StepStatus> {
  return {
    preview: 'pending',
    index: 'pending',
    notes: 'pending',
    persons: 'pending',
    groups: 'pending',
    places: 'pending',
    events: 'pending',
    postprocess: 'pending'
  }
}

async function loadCheckpoint(artifactDir: string): Promise<StandardProcessCheckpoint | null> {
  try {
    const raw = await readFile(path.join(artifactDir, CHECKPOINT_FILENAME), 'utf8')
    const parsed = JSON.parse(raw) as Partial<StandardProcessCheckpoint> & {
      artifacts?: Partial<StandardProcessCheckpoint['artifacts']> & { notesPaths?: string[] }
    }
    return {
      version: 1,
      sourceFile: parsed.sourceFile ?? '',
      model: parsed.model ?? DEFAULT_MODEL,
      steps: { ...initialSteps(), ...(parsed.steps ?? {}) },
      artifacts: {
        notes: parsed.artifacts?.notes ?? [],
        personsCreated: parsed.artifacts?.personsCreated ?? [],
        personsUpdated: parsed.artifacts?.personsUpdated ?? [],
        groupsCreated: parsed.artifacts?.groupsCreated ?? [],
        groupsUpdated: parsed.artifacts?.groupsUpdated ?? [],
        placesCreated: parsed.artifacts?.placesCreated ?? [],
        placesUpdated: parsed.artifacts?.placesUpdated ?? [],
        eventsPaths: parsed.artifacts?.eventsPaths ?? []
      },
      usage: parsed.usage ?? {},
      startedAt: parsed.startedAt ?? new Date().toISOString(),
      updatedAt: parsed.updatedAt ?? new Date().toISOString()
    }
  } catch {
    return null
  }
}

async function saveCheckpoint(artifactDir: string, cp: StandardProcessCheckpoint): Promise<void> {
  cp.updatedAt = new Date().toISOString()
  await writeFile(path.join(artifactDir, CHECKPOINT_FILENAME), JSON.stringify(cp, null, 2), 'utf8')
}

/**
 * Orquestra as 8 etapas do Standard Process para um documento.
 * Suporta resume: se o checkpoint existir e uma etapa ja estiver 'done', pula ela.
 * O CacheContext (Etapa 1) e sempre reexecutado ao retomar para recriar o prefixo,
 * mas o preview.md existente nao e sobrescrito nesse caso.
 */
export async function runStandardProcess(params: StandardProcessParams): Promise<StandardProcessResult> {
  await mkdir(params.artifactDir, { recursive: true })

  const model = params.model ?? DEFAULT_MODEL
  const artifactLanguageInstruction = buildArtifactLanguageInstruction(
    params.artifactLanguage ?? 'source'
  )
  const client = new OpenRouterClient(params.apiKey)
  const sourceFileName = basename(params.pdfPath)

  const existing = params.resume !== false ? await loadCheckpoint(params.artifactDir) : null

  const cp: StandardProcessCheckpoint = existing ?? {
    version: 1,
    sourceFile: params.pdfPath,
    model,
    steps: initialSteps(),
    artifacts: {
      notes: [],
      personsCreated: [],
      personsUpdated: [],
      groupsCreated: [],
      groupsUpdated: [],
      placesCreated: [],
      placesUpdated: [],
      eventsPaths: []
    },
    usage: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  if (cp.steps.preview !== 'done') {
    for (const key of Object.keys(cp.steps) as StepName[]) {
      if (key !== 'preview') cp.steps[key] = 'pending'
    }
  }

  const usages: OpenRouterUsage[] = [cp.usage]
  let checkpointSaveQueue: Promise<void> = Promise.resolve()

  const queueCheckpointSave = (updater: () => void): Promise<void> => {
    checkpointSaveQueue = checkpointSaveQueue.then(async () => {
      updater()
      cp.usage = mergeUsage(usages)
      await saveCheckpoint(params.artifactDir, cp)
    })
    return checkpointSaveQueue
  }

  const isRetriableError = (error: Error): boolean => {
    const msg = error.message ?? ''
    return RETRIABLE_STATUS_CODES.some((code) => msg.includes(String(code)))
  }

  const runStepWithRetry = async (
    stepName: StepName,
    run: () => Promise<void>,
    retries = 3
  ): Promise<void> => {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await run()
        return
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        lastError = error
        if (!isRetriableError(error) || attempt === retries) break
        const jitter = Math.floor(Math.random() * 350)
        const waitMs = Math.min(8000, 500 * 2 ** (attempt - 1)) + jitter
        params.onInfo?.(`[${stepName}] tentativa ${attempt}/${retries} falhou; retry em ${waitMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, waitMs))
      }
    }
    throw (lastError ?? new Error(`Falha desconhecida em ${stepName}`))
  }

  // ─── Etapa 1: Preview + CacheContext ─────────────────────────────────────
  let ctx: CacheContext | null = null
  const previewDone = cp.steps.preview === 'done'

  params.onStepStart?.('preview')
  try {
    const previewResult = await runStepPreview({
      pdfPath: params.pdfPath,
      sourceFileName,
      artifactDir: params.artifactDir,
      model,
      artifactLanguageInstruction,
      client
    })
    ctx = previewResult.ctx
    // Se estava retomando e preview ja estava done, nao sobrescreve
    if (!previewDone) {
      usages.push(previewResult.usage)
      cp.steps.preview = 'done'
      await saveCheckpoint(params.artifactDir, cp)
    }
    params.onArtifact?.({
      step: 'preview',
      path: path.join(params.artifactDir, 'preview.md'),
      changeType: previewDone ? 'edited' : 'new'
    })
    params.onStepDone?.('preview')
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    cp.steps.preview = 'failed'
    await saveCheckpoint(params.artifactDir, cp)
    params.onStepError?.('preview', error)
    throw error
  }

  // ─── Etapas 2-7: usa CacheContext ────────────────────────────────────────
  const cacheSteps: Array<{ name: StepName; run: () => Promise<void> }> = [
    {
      name: 'index',
      run: async () => {
        const result = await runStepIndex({
          ctx: ctx!,
          artifactDir: params.artifactDir,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        params.onArtifact?.({
          step: 'index',
          path: path.join(params.artifactDir, 'index.md'),
          changeType: 'edited'
        })
      }
    },
    {
      name: 'notes',
      run: async () => {
        const result = await runStepNotes({
          ctx: ctx!,
          sourceFileName,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        cp.artifacts.notes = result.notes
      }
    },
    {
      name: 'persons',
      run: async () => {
        const result = await runStepPersons({
          ctx: ctx!,
          peopleDir: params.dossierPeopleDir,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        cp.artifacts.personsCreated = [...cp.artifacts.personsCreated, ...result.created]
        cp.artifacts.personsUpdated = [...cp.artifacts.personsUpdated, ...result.updated]
        for (const filePath of result.created) {
          params.onArtifact?.({ step: 'persons', path: filePath, changeType: 'new' })
        }
        for (const filePath of result.updated) {
          params.onArtifact?.({ step: 'persons', path: filePath, changeType: 'edited' })
        }
      }
    },
    {
      name: 'groups',
      run: async () => {
        const result = await runStepGroups({
          ctx: ctx!,
          groupsDir: params.dossierGroupsDir,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        cp.artifacts.groupsCreated = [...cp.artifacts.groupsCreated, ...result.created]
        cp.artifacts.groupsUpdated = [...cp.artifacts.groupsUpdated, ...result.updated]
        for (const filePath of result.created) {
          params.onArtifact?.({ step: 'groups', path: filePath, changeType: 'new' })
        }
        for (const filePath of result.updated) {
          params.onArtifact?.({ step: 'groups', path: filePath, changeType: 'edited' })
        }
      }
    },
    {
      name: 'places',
      run: async () => {
        const result = await runStepPlaces({
          ctx: ctx!,
          placesDir: params.dossierPlacesDir,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        cp.artifacts.placesCreated = [...cp.artifacts.placesCreated, ...result.created]
        cp.artifacts.placesUpdated = [...cp.artifacts.placesUpdated, ...result.updated]
        for (const filePath of result.created) {
          params.onArtifact?.({ step: 'places', path: filePath, changeType: 'new' })
        }
        for (const filePath of result.updated) {
          params.onArtifact?.({ step: 'places', path: filePath, changeType: 'edited' })
        }
      }
    },
    {
      name: 'events',
      run: async () => {
        const result = await runStepEvents({
          ctx: ctx!,
          timelineDir: params.dossierTimelineDir,
          artifactLanguageInstruction,
          client
        })
        usages.push(result.usage)
        cp.artifacts.eventsPaths = [...new Set([...cp.artifacts.eventsPaths, ...result.eventsPaths])]
        for (const filePath of result.created) {
          params.onArtifact?.({ step: 'events', path: filePath, changeType: 'new' })
        }
        for (const filePath of result.eventsPaths) {
          params.onArtifact?.({ step: 'events', path: filePath, changeType: 'edited' })
        }
      }
    },
  ]

  const pendingCacheSteps = cacheSteps.filter((step) => cp.steps[step.name] !== 'done')
  const parallelLimit = Math.max(1, Math.min(params.parallelLimit ?? 2, pendingCacheSteps.length || 1))

  if (pendingCacheSteps.length > 0) {
    const queue = [...pendingCacheSteps]
    const failedInParallel: Array<{ name: StepName; run: () => Promise<void>; error: Error }> = []

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const step = queue.shift()
        if (!step) return
        params.onStepStart?.(step.name)
        try {
          await runStepWithRetry(step.name, step.run)
          await queueCheckpointSave(() => {
            cp.steps[step.name] = 'done'
          })
          params.onStepDone?.(step.name)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          await queueCheckpointSave(() => {
            cp.steps[step.name] = 'failed'
          })
          failedInParallel.push({ name: step.name, run: step.run, error })
          params.onStepError?.(step.name, error)
        }
      }
    }

    await Promise.all(Array.from({ length: parallelLimit }, () => worker()))

    if (failedInParallel.length > 0) {
      params.onInfo?.(
        `Fallback sequencial para ${failedInParallel.length} etapa(s): ${failedInParallel.map((s) => s.name).join(', ')}`
      )
      for (const step of failedInParallel) {
        params.onStepStart?.(step.name)
        try {
          await runStepWithRetry(step.name, step.run, 2)
          await queueCheckpointSave(() => {
            cp.steps[step.name] = 'done'
          })
          params.onStepDone?.(step.name)
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          await queueCheckpointSave(() => {
            cp.steps[step.name] = 'failed'
          })
          params.onStepError?.(step.name, error)
          throw error
        }
      }
    }
  }

  if (cp.steps.postprocess !== 'done') {
    params.onStepStart?.('postprocess')
    try {
      await runStepWithRetry('postprocess', async () => {
        await runStepPostprocess({
          artifactDir: params.artifactDir,
          artifactLanguage: params.artifactLanguage ?? 'source',
          entities: {
            persons: [...cp.artifacts.personsCreated, ...cp.artifacts.personsUpdated],
            groups: [...cp.artifacts.groupsCreated, ...cp.artifacts.groupsUpdated],
            places: [...cp.artifacts.placesCreated, ...cp.artifacts.placesUpdated],
            events: cp.artifacts.eventsPaths,
            notes: cp.artifacts.notes
          }
        })
      })
      await queueCheckpointSave(() => {
        cp.steps.postprocess = 'done'
      })
      params.onArtifact?.({
        step: 'postprocess',
        path: path.join(params.artifactDir, 'preview.md'),
        changeType: 'edited'
      })
      params.onArtifact?.({
        step: 'postprocess',
        path: path.join(params.artifactDir, 'metadata.md'),
        changeType: 'edited'
      })
      params.onStepDone?.('postprocess')
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      await queueCheckpointSave(() => {
        cp.steps.postprocess = 'failed'
      })
      params.onStepError?.('postprocess', error)
      throw error
    }
  }

  return { usage: mergeUsage(usages), artifacts: cp.artifacts }
}
