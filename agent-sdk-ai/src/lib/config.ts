import path from 'node:path'

export interface ReversoPaths {
  projectRoot: string
  legacyRoot: string
  filesystemRoot: string
  sourceDir: string
  sourceArtifactsDir: string
  outputDir: string
  reportsDir: string
  eventsDir: string
  investigationDir: string
  leadsDir: string
  allegationsDir: string
  findingsDir: string
  dossierDir: string
}

export interface ReversoConfig {
  paths: ReversoPaths
  modelId: string
  autoAcceptDefault: boolean
  providerMode: 'gateway' | 'openrouter'
  deepDiveSessionTtlMs: number
}

function asBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false
  return fallback
}

export function resolveConfig(): ReversoConfig {
  const projectRoot = process.cwd()
  const legacyRoot = path.resolve(
    process.env['REVERSO_AGENT_LEGACY_ROOT'] ??
      process.env['REVERSO_LEGACY_ROOT'] ??
      path.join(projectRoot, '..', 'agent')
  )
  const filesystemRoot = path.resolve(
    process.env['REVERSO_FILESYSTEM_ROOT'] ?? path.join(legacyRoot, 'filesystem')
  )

  const paths: ReversoPaths = {
    projectRoot,
    legacyRoot,
    filesystemRoot,
    sourceDir: path.join(filesystemRoot, 'source'),
    sourceArtifactsDir: path.join(filesystemRoot, 'source', '.artifacts'),
    outputDir: filesystemRoot,
    reportsDir: path.join(filesystemRoot, 'reports'),
    eventsDir: path.join(filesystemRoot, 'events'),
    investigationDir: path.join(filesystemRoot, 'investigation'),
    leadsDir: path.join(filesystemRoot, 'investigation', 'leads'),
    allegationsDir: path.join(filesystemRoot, 'investigation', 'allegations'),
    findingsDir: path.join(filesystemRoot, 'investigation', 'findings'),
    dossierDir: path.join(filesystemRoot, 'dossier'),
  }

  const ttlFromEnv = Number(process.env['REVERSO_DEEP_DIVE_SESSION_TTL_MS'] ?? 72 * 60 * 60 * 1000)
  const deepDiveSessionTtlMs = Number.isFinite(ttlFromEnv) && ttlFromEnv > 0
    ? ttlFromEnv
    : 72 * 60 * 60 * 1000

  return {
    paths,
    modelId: process.env['REVERSO_MODEL_ID'] ?? 'google/gemini-2.5-flash',
    autoAcceptDefault: asBool(process.env['REVERSO_AUTO_ACCEPT_DEFAULT'], false),
    providerMode: process.env['OPENROUTER_API_KEY'] ? 'openrouter' : 'gateway',
    deepDiveSessionTtlMs,
  }
}
