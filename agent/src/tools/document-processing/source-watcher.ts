// @ts-nocheck
/**
 * Listening na pasta source: detecta add/change/unlink e atualiza checkpoint global.
 */
import path from 'node:path'
import { watch } from 'node:fs'
import { scanSourceFiles, toSourceFileEntries } from './source-indexer.js'
import {
  loadSourceCheckpoint,
  upsertSourceFileEntries
} from './source-checkpoint.js'

const DEBOUNCE_MS = 500

export interface SourceWatcherOptions {
  sourceDir: string
  /** Se definido, ao detectar mudanças pode disparar processamento (all | selected | none). */
  autoProcess?: 'all' | 'selected' | 'none'
  /** Chamado após atualizar o checkpoint (ex.: para enfileirar processamento). */
  onCheckpointUpdated?: (sourceDir: string) => void
}

export function watchSource(options: SourceWatcherOptions): () => void {
  const sourceDirAbs = path.resolve(options.sourceDir)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshCheckpoint(): Promise<void> {
    try {
      const checkpoint = await loadSourceCheckpoint(sourceDirAbs)
      const existingByDocId = checkpoint?.files
        ? new Map(checkpoint.files.map((f) => [f.docId, f]))
        : undefined
      const scanned = await scanSourceFiles(sourceDirAbs)
      const entries = toSourceFileEntries(scanned, existingByDocId)
      await upsertSourceFileEntries(sourceDirAbs, entries)
      options.onCheckpointUpdated?.(sourceDirAbs)
    } catch (err) {
      console.error('Erro ao atualizar checkpoint:', err)
    }
  }

  function scheduleRefresh(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      refreshCheckpoint()
    }, DEBOUNCE_MS)
  }

  try {
    const w = watch(
      sourceDirAbs,
      { recursive: false },
      (eventType, filename) => {
        if (!filename || filename.startsWith('.')) return
        scheduleRefresh()
      }
    )
    refreshCheckpoint()
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      w.close()
    }
  } catch (err) {
    console.error('Erro ao iniciar watcher:', err)
    return () => {}
  }
}
