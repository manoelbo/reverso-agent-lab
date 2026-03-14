import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeEntityName } from './normalize.js'
import { isFuzzyMatch, similarityScore } from './fuzzy-match.js'
import type { GroupExtraction } from '../../../../core/contracts.js'

export interface GroupDedupMatch {
  filePath: string
  slug: string
  score: number
  matchedBy: 'registration_id' | 'name_fuzzy'
}

function extractFrontmatterField(markdown: string, field: string): string {
  const match = markdown.match(new RegExp(`^${field}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))
  return match?.[1]?.trim() ?? ''
}

function extractFrontmatterList(markdown: string, field: string): string[] {
  const sectionMatch = markdown.match(new RegExp(`^${field}:\\s*\\n((?:\\s+-[^\\n]+\\n?)*)`, 'm'))
  if (!sectionMatch?.[1]) return []
  return sectionMatch[1]
    .split('\n')
    .map((line) => line.replace(/^\s+-\s*/, '').trim())
    .filter(Boolean)
}

function normalizeRegistrationId(id: string | null): string | null {
  if (!id) return null
  return id.replace(/[.\-\/]/g, '').trim()
}

/**
 * Busca entidade Group existente.
 * 1. Match definitivo por registration_id exato (se nao null)
 * 2. Fallback: fuzzy no name (threshold >= 0.85)
 */
export async function findExistingGroup(
  extraction: GroupExtraction,
  groupsDir: string
): Promise<GroupDedupMatch | null> {
  let files: string[]
  try {
    files = await readdir(groupsDir)
  } catch {
    return null
  }

  const normalizedNewRegId = normalizeRegistrationId(extraction.registration_id)
  const normalizedNewName = normalizeEntityName(extraction.name)

  let bestMatch: GroupDedupMatch | null = null

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const filePath = path.join(groupsDir, file)
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const existingRegId = normalizeRegistrationId(extractFrontmatterField(content, 'registration_id'))
    const existingName = normalizeEntityName(extractFrontmatterField(content, 'name'))

    // Match definitivo por registration_id
    if (normalizedNewRegId && existingRegId && normalizedNewRegId === existingRegId) {
      return { filePath, slug: file.replace('.md', ''), score: 1, matchedBy: 'registration_id' }
    }

    // Fuzzy no nome
    const score = similarityScore(normalizedNewName, existingName)
    if (score >= 0.85 && (bestMatch === null || score > bestMatch.score)) {
      bestMatch = { filePath, slug: file.replace('.md', ''), score, matchedBy: 'name_fuzzy' }
    }
  }

  return bestMatch
}

/**
 * Faz merge de uma extracao de Group num arquivo existente.
 * - Preenche registration_id se antes era vazio
 * - Adiciona novos members sem duplicar
 * - Adiciona linha na tabela "Papel nos documentos"
 * - Unifica tags
 */
export async function mergeGroupInto(
  filePath: string,
  extraction: GroupExtraction
): Promise<void> {
  let content = await readFile(filePath, 'utf8')

  // Preenche registration_id se estava vazio
  const existingRegId = extractFrontmatterField(content, 'registration_id')
  if (!existingRegId && extraction.registration_id) {
    content = content.replace(
      /^registration_id:\s*"?[^"\n]*"?\s*$/m,
      `registration_id: "${extraction.registration_id}"`
    )
  }

  // Merge members na secao
  const membersSection = '## Membros / Representantes'
  if (content.includes(membersSection)) {
    const existingMembersMatch = content.match(/## Membros \/ Representantes\n([\s\S]*?)(?=\n##|\s*$)/)
    const existingMembers = existingMembersMatch?.[1] ?? ''
    const newMembers = extraction.members.filter(
      (m) => !existingMembers.includes(m.replace(/^\[\[|\]\]$/g, ''))
    )
    if (newMembers.length > 0) {
      const membersToAdd = newMembers.map((m) => `- ${m.startsWith('[[') ? m : `[[${m}]]`}`).join('\n')
      content = content.replace(
        existingMembers,
        `${existingMembers}${existingMembers.endsWith('\n') ? '' : '\n'}${membersToAdd}\n`
      )
    }
  }

  // Merge tags
  const existingTags = extractFrontmatterList(content, 'tags')
  const newTags = extraction.tags.filter((t) => !existingTags.includes(t))
  if (newTags.length > 0) {
    const tagsBlock = content.match(/^tags:\s*\n((?:\s+-[^\n]+\n?)*)/m)
    if (tagsBlock) {
      const existing = tagsBlock[1] ?? ''
      const added = newTags.map((t) => `  - ${t}`).join('\n')
      content = content.replace(tagsBlock[0], `tags:\n${existing}${added}\n`)
    }
  }

  // Adiciona linha na tabela "Papel nos documentos"
  const tableEntry = `| ${extraction.first_seen_in} | ${extraction.role_in_document} (obra/documento: ${extraction.first_seen_in}) | ${extraction.pages_mentioned.join(', ')} |`
  content = content.replace(
    /(## Papel nos documentos[\s\S]*?\|[^\n]+\|)\s*(\n##|\s*$)/,
    `$1\n${tableEntry}$2`
  )

  if (extraction.summary && !content.includes(extraction.first_seen_in)) {
    content = content.replace(
      /(## Resumo\s*\n+)([\s\S]*?)(?=\n##|\s*$)/,
      (_m, head, body) =>
        `${head}${body.trimEnd()}\n\nContexto adicional da obra/documento **${extraction.first_seen_in}**: ${extraction.summary}\n`
    )
  }

  await writeFile(filePath, content, 'utf8')
}
