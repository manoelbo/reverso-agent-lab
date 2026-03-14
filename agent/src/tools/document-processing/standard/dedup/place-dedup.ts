import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeForComparison, normalizeAddress } from './normalize.js'
import { similarityScore } from './fuzzy-match.js'
import type { PlaceExtraction } from '../../../../core/contracts.js'

export interface PlaceDedupMatch {
  filePath: string
  slug: string
  score: number
  matchedBy: 'address' | 'name_city'
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
 * Busca Place existente em toda a hierarquia dossier/places/.
 * 1. Por address normalizado (score >= 0.85)
 * 2. Fallback: por name + city + neighborhood (score >= 0.85)
 */
export async function findExistingPlace(
  extraction: PlaceExtraction,
  placesDir: string
): Promise<PlaceDedupMatch | null> {
  const normalizedNewAddress = extraction.address ? normalizeAddress(extraction.address) : null
  const normalizedNewKey = normalizeForComparison(
    [extraction.name, extraction.city, extraction.neighborhood].filter(Boolean).join(' ')
  )

  let bestMatch: PlaceDedupMatch | null = null

  async function scanDir(dir: string): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      const entryPath = path.join(dir, entry)
      if (entry.endsWith('.md')) {
        let content: string
        try {
          content = await readFile(entryPath, 'utf8')
        } catch {
          continue
        }

        const existingAddress = extractFrontmatterField(content, 'address')
        const existingName = extractFrontmatterField(content, 'name')
        const existingCity = extractFrontmatterField(content, 'city')
        const existingNeighborhood = extractFrontmatterField(content, 'neighborhood')

        // Match por address
        if (normalizedNewAddress && existingAddress) {
          const normalizedExistingAddress = normalizeAddress(existingAddress)
          const score = similarityScore(normalizedNewAddress, normalizedExistingAddress)
          if (score >= 0.85 && (bestMatch === null || score > bestMatch.score)) {
            bestMatch = { filePath: entryPath, slug: entry.replace('.md', ''), score, matchedBy: 'address' }
          }
        }

        // Fallback: match por name + city + neighborhood
        const existingKey = normalizeForComparison(
          [existingName, existingCity, existingNeighborhood].filter(Boolean).join(' ')
        )
        const score = similarityScore(normalizedNewKey, existingKey)
        if (score >= 0.85 && (bestMatch === null || score > bestMatch.score)) {
          bestMatch = { filePath: entryPath, slug: entry.replace('.md', ''), score, matchedBy: 'name_city' }
        }
      } else {
        // Subdiretorio (country/city)
        await scanDir(entryPath)
      }
    }
  }

  await scanDir(placesDir)
  return bestMatch
}

/**
 * Faz merge de uma extracao de Place num arquivo existente.
 * - Preenche campos null (neighborhood, address, coordinates)
 * - Adiciona linha na tabela de documentos
 * - Adiciona entidades vinculadas
 * - Unifica tags
 */
export async function mergePlaceInto(
  filePath: string,
  extraction: PlaceExtraction
): Promise<void> {
  let content = await readFile(filePath, 'utf8')

  // Preenche neighborhood se estava vazio
  const existingNeighborhood = extractFrontmatterField(content, 'neighborhood')
  if (!existingNeighborhood && extraction.neighborhood) {
    content = content.replace(
      /^neighborhood:\s*"?[^"\n]*"?\s*$/m,
      `neighborhood: "${extraction.neighborhood}"`
    )
  }

  // Preenche address se estava vazio
  const existingAddress = extractFrontmatterField(content, 'address')
  if (!existingAddress && extraction.address) {
    content = content.replace(
      /^address:\s*"?[^"\n]*"?\s*$/m,
      `address: "${extraction.address}"`
    )
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

  // Adiciona linha na tabela de contexto
  const tableEntry = `| ${extraction.first_seen_in} | ${extraction.context} (obra/documento: ${extraction.first_seen_in}) | ${extraction.pages_mentioned.join(', ')} |`
  content = content.replace(
    /(## Contexto nos documentos[\s\S]*?\|[^\n]+\|)\s*(\n##|\s*$)/,
    `$1\n${tableEntry}$2`
  )

  if (extraction.context && !content.includes(extraction.first_seen_in)) {
    content = content.replace(
      /(## Resumo\s*\n+)([\s\S]*?)(?=\n##|\s*$)/,
      (_m, head, body) =>
        `${head}${body.trimEnd()}\n\nContexto adicional da obra/documento **${extraction.first_seen_in}**: ${extraction.context}\n`
    )
  }

  await writeFile(filePath, content, 'utf8')
}
