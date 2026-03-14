import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { basename } from 'node:path'
import type { NoteItem } from '../../../../core/contracts.js'
import {
  detectLanguageFromText,
  type ArtifactLanguage
} from '../../../../core/language.js'

export interface PostprocessEntities {
  persons: string[]
  groups: string[]
  places: string[]
  events: string[]
  notes: NoteItem[]
}

export interface StepPostprocessParams {
  artifactDir: string
  artifactLanguage?: ArtifactLanguage
  entities: PostprocessEntities
}

export interface StepPostprocessResult {
  metadataPath: string
  previewPath: string
}

function toWikiLinks(filePaths: string[]): string[] {
  return filePaths.map((fp) => {
    const name = basename(fp, '.md')
    return `[[${name}]]`
  })
}

function renderNotesSection(notes: NoteItem[], labels: { notesTitle: string; page: string }): string {
  if (notes.length === 0) return ''
  const lines = notes
    .sort((a, b) => a.page - b.page)
    .map((note) => {
      const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : ''
      return `- **${note.category}** — ${labels.page} ${note.page}: "${note.highlight}"${tags}\n  - ${note.description}`
    })
    .join('\n')
  return `\n## ${labels.notesTitle}\n\n${lines}\n`
}

function updateMetadataEntities(
  existingContent: string,
  entities: PostprocessEntities,
  labels: {
    extractedEntitiesTitle: string
    persons: string
    groups: string
    places: string
    events: string
    notesCount: string
    none: string
  }
): string {
  const escapedTitle = labels.extractedEntitiesTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const personsLinks = toWikiLinks(entities.persons).join(', ')
  const groupsLinks = toWikiLinks(entities.groups).join(', ')
  const placesLinks = toWikiLinks(entities.places).join(', ')

  const sectionToAdd = `
## ${labels.extractedEntitiesTitle}

**${labels.persons}:** ${personsLinks || labels.none}
**${labels.groups}:** ${groupsLinks || labels.none}
**${labels.places}:** ${placesLinks || labels.none}
**${labels.events}:** ${entities.events.map((f) => basename(f)).join(', ') || labels.none}
**${labels.notesCount}:** ${entities.notes.length}
`

  // Substitui se ja existe, senao adiciona ao final
  if (existingContent.includes(`## ${labels.extractedEntitiesTitle}`)) {
    return existingContent.replace(
      new RegExp(`\\n## ${escapedTitle}[\\s\\S]*?(?=\\n##|\\s*$)`),
      sectionToAdd
    )
  }
  return `${existingContent.trimEnd()}\n${sectionToAdd}`
}

function updatePreviewWithNotes(
  existingContent: string,
  notes: NoteItem[],
  labels: { notesTitle: string; page: string }
): string {
  const escapedNotesTitle = labels.notesTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (notes.length === 0) return existingContent

  const notesSection = renderNotesSection(notes, labels)

  // Substitui secao de notes se ja existe
  if (existingContent.includes(`## ${labels.notesTitle}`)) {
    return existingContent.replace(
      new RegExp(`\\n## ${escapedNotesTitle}[\\s\\S]*?(?=\\n##|\\s*$)`),
      notesSection
    )
  }

  // Adiciona antes da ultima secao ou ao final
  return `${existingContent.trimEnd()}\n${notesSection}`
}

/**
 * Etapa 8: pos-processamento apos todas as etapas de extracao.
 * - Atualiza metadata.md com lista de entidades extraidas
 * - Atualiza preview.md com links para as Notes geradas
 */
export async function runStepPostprocess(
  params: StepPostprocessParams
): Promise<StepPostprocessResult> {
  const metadataPath = path.join(params.artifactDir, 'metadata.md')
  const previewPath = path.join(params.artifactDir, 'preview.md')

  // Atualiza metadata.md
  let metadataContent = ''
  try {
    metadataContent = await readFile(metadataPath, 'utf8')
  } catch {
    // metadata.md nao existe ainda, cria basico
    metadataContent = '---\ntype: metadata\n---\n\n# Metadata\n'
  }
  const autoDetected =
    params.artifactLanguage === 'source' ? detectLanguageFromText(metadataContent) : undefined
  const lang = params.artifactLanguage === 'source' ? autoDetected ?? 'en' : params.artifactLanguage ?? 'en'
  const labels =
    lang === 'pt'
      ? {
          extractedEntitiesTitle: 'Extracted entities (Standard Process)',
          persons: 'persons_mentioned',
          groups: 'groups_mentioned',
          places: 'places_mentioned',
          events: 'events_mentioned',
          notesCount: 'notes_count',
          none: '(nenhum)',
          notesTitle: 'Generated notes',
          page: 'Página'
        }
      : {
          extractedEntitiesTitle: 'Extracted entities (Standard Process)',
          persons: 'persons_mentioned',
          groups: 'groups_mentioned',
          places: 'places_mentioned',
          events: 'events_mentioned',
          notesCount: 'notes_count',
          none: '(none)',
          notesTitle: 'Generated notes',
          page: 'Page'
        }
  const updatedMetadata = updateMetadataEntities(metadataContent, params.entities, labels)
  await writeFile(metadataPath, updatedMetadata, 'utf8')

  // Atualiza preview.md com links de notes
  let previewContent = ''
  try {
    previewContent = await readFile(previewPath, 'utf8')
  } catch {
    previewContent = ''
  }
  const updatedPreview = updatePreviewWithNotes(previewContent, params.entities.notes, labels)
  await writeFile(previewPath, updatedPreview, 'utf8')

  return { metadataPath, previewPath }
}
