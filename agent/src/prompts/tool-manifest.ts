import type { ToolName } from '../core/tool-registry.js'

export interface ToolManifestItem {
  name: ToolName
  description: string
  whenToUse: string
}

export const TOOL_MANIFEST: ToolManifestItem[] = [
  {
    name: 'createDossierEntity',
    description: 'Creates dossier entities (person, group, place) in dedicated files.',
    whenToUse: 'Use when you identify actors, organizations, or places that should be materialized.'
  },
  {
    name: 'createTimelineEvent',
    description: 'Creates timeline events in monthly dossier files with date, actors, and description.',
    whenToUse: 'Use when there is a relevant temporal milestone to order events.'
  },
  {
    name: 'linkEntities',
    description: 'Adds [[wiki-links]] connections between entities inside a markdown file.',
    whenToUse: 'Use when you need to make relationships explicit between actors, places, and documents.'
  },
  {
    name: 'processSourceTool',
    description:
      'Runs source processing subcommands (queue, status, selection, and watch workflows).',
    whenToUse:
      'Use when you need to generate/update artifacts in source/.artifacts before init, dig, create-lead, or inquiry.'
  }
]

export function getToolManifestForPrompt(items: ToolManifestItem[] = TOOL_MANIFEST): string {
  const lines = items.map(
    (item, idx) =>
      `${idx + 1}. ${item.name}\n- description: ${item.description}\n- when_to_use: ${item.whenToUse}`
  )
  return ['Available agent tools:', ...lines].join('\n')
}
