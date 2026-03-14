import path from 'node:path'
import type { DossierEntity, DossierEntityType, GroupCategory } from '../../core/contracts.js'
import { slugify, writeUtf8, ensureDir } from '../../core/fs-io.js'
import { buildSourceTrace, formatFrontmatter } from '../../core/markdown.js'
import { findExistingPerson, mergePersonInto } from '../document-processing/standard/dedup/person-dedup.js'
import { findExistingGroup, mergeGroupInto } from '../document-processing/standard/dedup/group-dedup.js'
import { findExistingPlace, mergePlaceInto } from '../document-processing/standard/dedup/place-dedup.js'
import type { ToolContext } from './context.js'

export interface CreateDossierEntityInput {
  type: DossierEntityType
  name: string
  summary: string
  aliases?: string[]
  category?: string
  registrationId?: string
  members?: string[]
  country?: string
  city?: string
  neighborhood?: string
  address?: string
  coordinates?: [number, number]
  tags?: string[]
  firstSeenIn?: string
  source?: string
  page?: number
  roleInDocument?: string
  pagesmentioned?: number[]
  /** Se true, tenta deduplicar antes de criar (upsert). Default: false. */
  upsert?: boolean
}

export interface CreateDossierEntityOutput {
  entity: DossierEntity
  filePath: string
  action: 'created' | 'updated'
}

function resolveEntityDir(type: DossierEntityType, ctx: ToolContext, input: CreateDossierEntityInput): string {
  if (type === 'person') return ctx.paths.dossierPeopleDir
  if (type === 'group') return ctx.paths.dossierGroupsDir
  // Place: estrutura hierarquica por pais/cidade
  const country = input.country || 'Unknown'
  const city = input.city || 'Unknown'
  return path.join(ctx.paths.dossierPlacesDir, country, city)
}

function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((tag) => slugify(tag).replace(/^-+|-+$/g, '')).filter(Boolean))]
}

function buildPersonContent(input: CreateDossierEntityInput, entity: DossierEntity, now: string): string {
  const aliasLines = (input.aliases ?? []).map((a) => `  - "${a}"`).join('\n')
  const tagLines = normalizeTags(input.tags).map((t) => `  - ${t}`).join('\n')
  const pages = (input.pagesmentioned ?? (input.page ? [input.page] : [])).join(', ')
  const role = input.roleInDocument ?? ''
  const sourceDoc = input.firstSeenIn ?? input.source ?? ''
  const tableRow = `| ${sourceDoc} | ${role} (obra/documento: ${sourceDoc}) | ${pages} |`

  const fm = [
    '---',
    'type: person',
    `name: "${entity.name}"`,
    'aliases:',
    aliasLines || '  []',
    `category: ${input.category ?? 'other'}`,
    `first_seen_in: "${input.firstSeenIn ?? input.source ?? ''}"`,
    'tags:',
    tagLines || '  []',
    `created: ${now}`,
    `updated: ${now}`,
    '---'
  ].join('\n')

  return [
    fm,
    '',
    `# ${entity.name}`,
    '',
    '## Resumo',
    '',
    entity.summary
      ? `${entity.summary}\n\nContexto desta entrada: obra/documento **${sourceDoc}**.`
      : `${entity.name}`,
    '',
    '## Papel nos documentos',
    '',
    '| Documento | Papel | Páginas |',
    '| --- | --- | --- |',
    tableRow,
    '',
    '## Anotações investigativas',
    '',
    '(Preenchido posteriormente pelo agente via :::annotation blocks)',
    '',
    '## Connections',
    '',
    '(Auto-gerado pelo renderer via backlinks)',
    ''
  ].join('\n')
}

function buildGroupContent(input: CreateDossierEntityInput, entity: DossierEntity, now: string): string {
  const memberLines = (input.members ?? [])
    .map((m) => `- ${m.startsWith('[[') ? m : `[[${m}]]`}`)
    .join('\n')
  const tagLines = normalizeTags(input.tags).map((t) => `  - ${t}`).join('\n')
  const pages = (input.pagesmentioned ?? (input.page ? [input.page] : [])).join(', ')
  const role = input.roleInDocument ?? ''
  const sourceDoc = input.firstSeenIn ?? input.source ?? ''
  const tableRow = `| ${sourceDoc} | ${role} (obra/documento: ${sourceDoc}) | ${pages} |`

  const fm = [
    '---',
    'type: group',
    `name: "${entity.name}"`,
    `category: ${input.category ?? 'company'}`,
    `registration_id: "${input.registrationId ?? ''}"`,
    `first_seen_in: "${input.firstSeenIn ?? input.source ?? ''}"`,
    'tags:',
    tagLines || '  []',
    `created: ${now}`,
    `updated: ${now}`,
    '---'
  ].join('\n')

  return [
    fm,
    '',
    `# ${entity.name}`,
    '',
    '## Resumo',
    '',
    entity.summary
      ? `${entity.summary}\n\nContexto desta entrada: obra/documento **${sourceDoc}**.`
      : `${entity.name}`,
    '',
    '## Membros / Representantes',
    '',
    memberLines || '(Nenhum identificado)',
    '',
    '## Papel nos documentos',
    '',
    '| Documento | Papel | Páginas |',
    '| --- | --- | --- |',
    tableRow,
    '',
    '## Anotações investigativas',
    '',
    '(Preenchido posteriormente pelo agente via :::annotation blocks)',
    '',
    '## Connections',
    '',
    '(Auto-gerado pelo renderer via backlinks)',
    ''
  ].join('\n')
}

function buildPlaceContent(input: CreateDossierEntityInput, entity: DossierEntity, now: string): string {
  const tagLines = normalizeTags(input.tags).map((t) => `  - ${t}`).join('\n')
  const pages = (input.pagesmentioned ?? (input.page ? [input.page] : [])).join(', ')
  const context = entity.summary || ''
  const sourceDoc = input.firstSeenIn ?? input.source ?? ''
  const tableRow = `| ${sourceDoc} | ${context.slice(0, 100)} (obra/documento: ${sourceDoc}) | ${pages} |`

  const fm = [
    '---',
    'type: place',
    `name: "${entity.name}"`,
    `country: "${input.country ?? ''}"`,
    `city: "${input.city ?? ''}"`,
    `neighborhood: "${input.neighborhood ?? ''}"`,
    `address: "${input.address ?? ''}"`,
    input.coordinates ? `coordinates: "${input.coordinates[0]}, ${input.coordinates[1]}"` : 'coordinates: null',
    `first_seen_in: "${input.firstSeenIn ?? input.source ?? ''}"`,
    'tags:',
    tagLines || '  []',
    `created: ${now}`,
    `updated: ${now}`,
    '---'
  ].join('\n')

  return [
    fm,
    '',
    `# ${entity.name}`,
    '',
    '## Resumo',
    '',
    entity.summary
      ? `${entity.summary}\n\nContexto desta entrada: obra/documento **${sourceDoc}**.`
      : `${entity.name}, ${input.city}`,
    '',
    '## Contexto nos documentos',
    '',
    '| Documento | Contexto | Páginas |',
    '| --- | --- | --- |',
    tableRow,
    '',
    '## Entidades vinculadas',
    '',
    '(Preenchido pelo agente)',
    '',
    '## Connections',
    '',
    '(Auto-gerado pelo renderer via backlinks)',
    ''
  ].join('\n')
}

export async function createDossierEntity(
  input: CreateDossierEntityInput,
  ctx: ToolContext
): Promise<CreateDossierEntityOutput> {
  const now = new Date().toISOString()
  const slug = slugify(input.name || `entity-${Date.now()}`)
  const tags = normalizeTags(input.tags)

  const base = {
    type: input.type,
    name: input.name,
    slug,
    summary: input.summary,
    tags,
    createdAt: now,
    updatedAt: now,
    ...(input.firstSeenIn ? { firstSeenIn: input.firstSeenIn } : {})
  } as const

  let entity: DossierEntity
  if (input.type === 'person') {
    entity = {
      ...base,
      type: 'person',
      ...(input.aliases?.length ? { aliases: input.aliases } : {}),
      ...(input.category ? { category: input.category } : {})
    }
  } else if (input.type === 'group') {
    entity = {
      ...base,
      type: 'group',
      category: (input.category as GroupCategory) || 'company',
      ...(input.registrationId ? { registrationId: input.registrationId } : {}),
      ...(input.members?.length ? { members: input.members } : {})
    }
  } else {
    entity = {
      ...base,
      type: 'place',
      ...(input.country ? { country: input.country } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.neighborhood ? { neighborhood: input.neighborhood } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.coordinates ? { coordinates: input.coordinates } : {})
    }
  }

  // Upsert: tentar deduplicar antes de criar
  if (input.upsert) {
    if (input.type === 'person') {
      const extraction = {
        type: 'person' as const,
        name: input.name,
        aliases: input.aliases ?? [],
        category: input.category ?? 'other',
        role_in_document: input.roleInDocument ?? '',
        why_relevant: '',
        first_seen_in: input.firstSeenIn ?? input.source ?? '',
        pages_mentioned: input.pagesmentioned ?? (input.page ? [input.page] : []),
        tags,
        summary: input.summary
      }
      const match = await findExistingPerson(extraction, ctx.paths.dossierPeopleDir)
      if (match) {
        await mergePersonInto(match.filePath, extraction)
        return { entity, filePath: match.filePath, action: 'updated' }
      }
    } else if (input.type === 'group') {
      const extraction = {
        type: 'group' as const,
        name: input.name,
        category: (input.category as GroupCategory) ?? 'company',
        registration_id: input.registrationId ?? null,
        members: input.members ?? [],
        role_in_document: input.roleInDocument ?? '',
        why_relevant: '',
        first_seen_in: input.firstSeenIn ?? input.source ?? '',
        pages_mentioned: input.pagesmentioned ?? (input.page ? [input.page] : []),
        tags,
        summary: input.summary
      }
      const match = await findExistingGroup(extraction, ctx.paths.dossierGroupsDir)
      if (match) {
        await mergeGroupInto(match.filePath, extraction)
        return { entity, filePath: match.filePath, action: 'updated' }
      }
    } else if (input.type === 'place') {
      const extraction = {
        type: 'place' as const,
        name: input.name,
        country: input.country ?? '',
        city: input.city ?? '',
        neighborhood: input.neighborhood ?? null,
        address: input.address ?? null,
        coordinates: null as null,
        context: input.summary,
        first_seen_in: input.firstSeenIn ?? input.source ?? '',
        pages_mentioned: input.pagesmentioned ?? (input.page ? [input.page] : []),
        tags
      }
      const match = await findExistingPlace(extraction, ctx.paths.dossierPlacesDir)
      if (match) {
        await mergePlaceInto(match.filePath, extraction)
        return { entity, filePath: match.filePath, action: 'updated' }
      }
    }
  }

  // Nao encontrou match ou upsert=false: cria novo arquivo
  const entityDir = resolveEntityDir(input.type, ctx, input)
  await ensureDir(entityDir)
  const filePath = path.join(entityDir, `${slug}.md`)

  let content: string
  if (input.type === 'person') {
    content = buildPersonContent(input, entity, now)
  } else if (input.type === 'group') {
    content = buildGroupContent(input, entity, now)
  } else {
    content = buildPlaceContent(input, entity, now)
  }

  await writeUtf8(filePath, content)
  return { entity, filePath, action: 'created' }
}
