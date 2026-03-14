import { readFile } from 'node:fs/promises'
import { extractCandidateEntities } from '../../core/markdown.js'
import { writeUtf8 } from '../../core/fs-io.js'

export interface LinkEntitiesInput {
  filePath: string
  entities?: string[]
}

export interface LinkEntitiesOutput {
  filePath: string
  linksFound: number
}

export async function linkEntities(input: LinkEntitiesInput): Promise<LinkEntitiesOutput> {
  const content = await readFile(input.filePath, 'utf8')
  const entities = (input.entities && input.entities.length > 0 ? input.entities : extractCandidateEntities(content))
    .map((item) => item.trim())
    .filter((item) => item.length > 1)

  const unique = [...new Set(entities)]
  if (unique.length === 0) {
    return { filePath: input.filePath, linksFound: 0 }
  }

  const links = unique.map((entity) => `[[${entity}]]`)
  const section = ['## Conexoes', '', ...links.map((link) => `- ${link}`), ''].join('\n')
  const updated = content.includes('## Conexoes') ? content : `${content}\n\n${section}`
  await writeUtf8(input.filePath, updated)
  return { filePath: input.filePath, linksFound: unique.length }
}

