import path from 'node:path'
import { access } from 'node:fs/promises'

export interface LabPaths {
  projectRoot: string
  labRoot: string
  filesystemDir: string
  sourceDir: string
  sourceArtifactsDir: string
  inputDir: string
  outputDir: string
  eventsDir: string
  dossierDir: string
  dossierPeopleDir: string
  dossierGroupsDir: string
  dossierPlacesDir: string
  dossierTimelineDir: string
  investigationDir: string
  leadsDir: string
  allegationsDir: string
  findingsDir: string
  notesDir: string
  reportsDir: string
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function findProjectRoot(fromDir: string): Promise<string> {
  let current = path.resolve(fromDir)
  while (true) {
    const envPath = path.join(current, '.env.local')
    if (await exists(envPath)) return current
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error('Nao foi possivel encontrar .env.local subindo diretorios.')
    }
    current = parent
  }
}

export async function resolveLabPaths(cwd: string): Promise<LabPaths> {
  const projectRoot = await findProjectRoot(cwd)
  const labRoot = path.join(projectRoot, 'lab', 'agent')
  const filesystemName = process.env['AGENT_FILESYSTEM_DIR'] ?? 'filesystem'
  const filesystemDir = path.join(labRoot, filesystemName)
  const sourceDir = path.join(filesystemDir, 'source')
  const sourceArtifactsDir = path.join(sourceDir, '.artifacts')
  const outputDir = filesystemDir
  const dossierDir = path.join(outputDir, 'dossier')
  const investigationDir = path.join(outputDir, 'investigation')
  return {
    projectRoot,
    labRoot,
    filesystemDir,
    sourceDir,
    sourceArtifactsDir,
    inputDir: path.join(labRoot, 'input', 'markdown_examples'),
    outputDir,
    eventsDir: path.join(outputDir, 'events'),
    dossierDir,
    dossierPeopleDir: path.join(dossierDir, 'people'),
    dossierGroupsDir: path.join(dossierDir, 'groups'),
    dossierPlacesDir: path.join(dossierDir, 'places'),
    dossierTimelineDir: path.join(dossierDir, 'timeline'),
    investigationDir,
    leadsDir: path.join(investigationDir, 'leads'),
    allegationsDir: path.join(investigationDir, 'allegations'),
    findingsDir: path.join(investigationDir, 'findings'),
    notesDir: path.join(investigationDir, 'notes'),
    reportsDir: path.join(outputDir, 'reports')
  }
}

export function toRelative(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath) || '.'
}

