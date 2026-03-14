import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeForComparison } from './normalize.js'
import { isFuzzyMatch, similarityScore } from './fuzzy-match.js'
import type { PersonExtraction } from '../../../../core/contracts.js'

export interface PersonDedupMatch {
  filePath: string
  slug: string
  score: number
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

/**
 * Busca entidade Person existente por similaridade de nome + aliases.
 * Score >= 0.85 = match.
 */
export async function findExistingPerson(
  extraction: PersonExtraction,
  peopleDir: string
): Promise<PersonDedupMatch | null> {
  let files: string[]
  try {
    files = await readdir(peopleDir)
  } catch {
    return null
  }

  const normalizedName = normalizeForComparison(extraction.name)
  const normalizedAliases = extraction.aliases.map(normalizeForComparison)

  let bestMatch: PersonDedupMatch | null = null

  for (const file of files) {
    if (!file.endsWith('.md')) continue
    const filePath = path.join(peopleDir, file)
    let content: string
    try {
      content = await readFile(filePath, 'utf8')
    } catch {
      continue
    }

    const existingName = normalizeForComparison(extractFrontmatterField(content, 'name'))
    const existingAliases = extractFrontmatterList(content, 'aliases').map(normalizeForComparison)

    const candidates = [existingName, ...existingAliases].filter(Boolean)
    const queries = [normalizedName, ...normalizedAliases].filter(Boolean)

    let topScore = 0
    for (const q of queries) {
      for (const c of candidates) {
        const score = similarityScore(q, c)
        if (score > topScore) topScore = score
      }
    }

    if (topScore >= 0.85 && (bestMatch === null || topScore > bestMatch.score)) {
      bestMatch = {
        filePath,
        slug: file.replace('.md', ''),
        score: topScore
      }
    }
  }

  return bestMatch
}

/**
 * Faz merge de uma extracao de Person num arquivo existente.
 * - Adiciona novos aliases sem duplicar
 * - Adiciona nova entrada na tabela "Papel nos documentos"
 * - Unifica tags sem duplicar
 * - Nao sobrescreve o summary existente
 */
export async function mergePersonInto(
  filePath: string,
  extraction: PersonExtraction
): Promise<void> {
  let content = await readFile(filePath, 'utf8')

  // Merge aliases no frontmatter
  const existingAliases = extractFrontmatterList(content, 'aliases')
  const newAliases = extraction.aliases.filter(
    (a) => !existingAliases.some((e) => isFuzzyMatch(normalizeForComparison(e), normalizeForComparison(a)))
  )
  if (newAliases.length > 0) {
    const aliasBlock = content.match(/^aliases:\s*\n((?:\s+-[^\n]+\n?)*)/m)
    if (aliasBlock) {
      const existing = aliasBlock[1] ?? ''
      const added = newAliases.map((a) => `  - "${a}"`).join('\n')
      content = content.replace(aliasBlock[0], `aliases:\n${existing}${added}\n`)
    }
  }

  // Merge tags no frontmatter
  const existingTags = extractFrontmatterList(content, 'tags')
  const newTags = extraction.tags.filter(
    (t) => !existingTags.includes(t)
  )
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
  const tableSection = '## Papel nos documentos'
  if (content.includes(tableSection)) {
    // Insere linha antes do proximo ## ou fim do arquivo
    content = content.replace(
      /(## Papel nos documentos[\s\S]*?\|[^\n]+\|)\s*(\n##|\s*$)/,
      `$1\n${tableEntry}$2`
    )
  }

  if (extraction.summary && !content.includes(extraction.first_seen_in)) {
    content = content.replace(
      /(## Resumo\s*\n+)([\s\S]*?)(?=\n##|\s*$)/,
      (_m, head, body) =>
        `${head}${body.trimEnd()}\n\nContexto adicional da obra/documento **${extraction.first_seen_in}**: ${extraction.summary}\n`
    )
  }

  await writeFile(filePath, content, 'utf8')
}
