import fs from 'node:fs/promises'
import path from 'node:path'

export type ResetMode = 'chat' | 'investigation' | 'sources-artefacts' | 'all'

async function rmDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true })
}

async function rmFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true })
}

async function mkDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

async function clearDir(dirPath: string): Promise<void> {
  await rmDir(dirPath)
  await mkDir(dirPath)
}

/**
 * Reset chat only — remove conversation history and active deep-dive session.
 * Keeps: source (PDFs + .artifacts), investigation (leads, findings, etc.), dossier, agent.md
 */
async function resetChat(filesystemDir: string): Promise<void> {
  const sessionsDir = path.join(filesystemDir, 'sessions')
  await clearDir(path.join(sessionsDir, 'chat'))
  await clearDir(path.join(sessionsDir, 'deep-dive'))
}

/**
 * Reset investigation — remove all investigative outputs and sessions.
 * Keeps: source (PDFs + .artifacts), dossier, agent.md
 */
async function resetInvestigation(filesystemDir: string): Promise<void> {
  await resetChat(filesystemDir)

  const investigationDir = path.join(filesystemDir, 'investigation')
  await clearDir(path.join(investigationDir, 'leads'))
  await clearDir(path.join(investigationDir, 'allegations'))
  await clearDir(path.join(investigationDir, 'findings'))
  await clearDir(path.join(investigationDir, 'checkpoints'))
  await clearDir(path.join(investigationDir, 'notes'))
  await clearDir(path.join(investigationDir, 'locks'))
}

/**
 * Reset sources + artefacts — keep only raw PDFs in source/.
 * Removes everything generated: sessions, investigation, dossier, agent.md, source artifacts.
 */
async function resetSourcesArtefacts(filesystemDir: string): Promise<void> {
  await resetInvestigation(filesystemDir)

  // Remove source artifacts and checkpoint (keep PDFs)
  await rmDir(path.join(filesystemDir, 'source', '.artifacts'))
  await rmFile(path.join(filesystemDir, 'source', 'source-checkpoint.json'))

  // Remove dossier content
  const dossierDir = path.join(filesystemDir, 'dossier')
  await clearDir(path.join(dossierDir, 'people'))
  await clearDir(path.join(dossierDir, 'groups'))
  await clearDir(path.join(dossierDir, 'places'))
  await clearDir(path.join(dossierDir, 'timeline'))

  // Remove agent context files
  await rmFile(path.join(filesystemDir, 'agent.md'))
  await rmFile(path.join(filesystemDir, 'deep-dive-session.json'))
}

/**
 * Reset all — wipe entire filesystem_test state.
 * Leaves the filesystem directory empty (no PDFs, no data).
 */
async function resetAll(filesystemDir: string): Promise<void> {
  // Read all entries at the root level and delete them
  let entries: string[] = []
  try {
    entries = await fs.readdir(filesystemDir)
  } catch {
    return
  }

  await Promise.all(
    entries.map((entry) => rmDir(path.join(filesystemDir, entry)))
  )

  // Recreate the minimal directory structure
  await mkDir(path.join(filesystemDir, 'source'))
  await mkDir(path.join(filesystemDir, 'sessions', 'chat'))
  await mkDir(path.join(filesystemDir, 'sessions', 'deep-dive'))
  await mkDir(path.join(filesystemDir, 'investigation', 'leads'))
  await mkDir(path.join(filesystemDir, 'investigation', 'allegations'))
  await mkDir(path.join(filesystemDir, 'investigation', 'findings'))
  await mkDir(path.join(filesystemDir, 'investigation', 'notes'))
  await mkDir(path.join(filesystemDir, 'dossier'))
}

export async function resetFilesystem(
  mode: ResetMode,
  filesystemDir: string,
): Promise<{ ok: boolean; mode: ResetMode; message: string }> {
  // Safety check: refuse to operate on the real 'filesystem' directory
  if (!filesystemDir.includes('filesystem_test')) {
    return {
      ok: false,
      mode,
      message: 'Reset only available in test mode (filesystem_test)',
    }
  }

  switch (mode) {
    case 'chat':
      await resetChat(filesystemDir)
      return { ok: true, mode, message: 'Chat history and sessions cleared' }

    case 'investigation':
      await resetInvestigation(filesystemDir)
      return { ok: true, mode, message: 'Investigation (leads, allegations, findings) cleared' }

    case 'sources-artefacts':
      await resetSourcesArtefacts(filesystemDir)
      return { ok: true, mode, message: 'Source artifacts cleared — only PDFs remain' }

    case 'all':
      await resetAll(filesystemDir)
      return { ok: true, mode, message: 'Full reset — filesystem_test wiped' }

    default:
      return { ok: false, mode, message: `Unknown reset mode: ${String(mode)}` }
  }
}

export function isValidResetMode(value: unknown): value is ResetMode {
  return value === 'chat' || value === 'investigation' || value === 'sources-artefacts' || value === 'all'
}
