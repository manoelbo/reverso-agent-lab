import path from 'node:path';

export interface AgentPaths {
  filesystemDir: string;
  sourceDir: string;
  sourceArtifactsDir: string;
  outputDir: string;
  eventsDir: string;
  dossierDir: string;
  dossierPeopleDir: string;
  dossierGroupsDir: string;
  dossierPlacesDir: string;
  dossierTimelineDir: string;
  investigationDir: string;
  leadsDir: string;
  allegationsDir: string;
  findingsDir: string;
  notesDir: string;
  reportsDir: string;
}

export function resolveAgentPaths(filesystemDirOverride?: string): AgentPaths {
  const raw = filesystemDirOverride ?? process.env.AGENT_FILESYSTEM_DIR ?? '../agent/filesystem';
  const filesystemDir = path.resolve(process.cwd(), raw);
  const sourceDir = path.join(filesystemDir, 'source');
  const sourceArtifactsDir = path.join(sourceDir, '.artifacts');
  const outputDir = filesystemDir;
  const dossierDir = path.join(outputDir, 'dossier');
  const investigationDir = path.join(outputDir, 'investigation');

  return {
    filesystemDir,
    sourceDir,
    sourceArtifactsDir,
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
    reportsDir: path.join(outputDir, 'reports'),
  };
}
