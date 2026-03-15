import path from 'node:path'

export interface LeadSummary {
  slug: string
  title: string
  status: string
}

export function extractJsonCandidate(text: string): string | undefined {
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace <= firstBrace) return undefined
  return text.slice(firstBrace, lastBrace + 1)
}

export function parseLeadSummaryFromMarkdown(input: {
  fileName: string
  raw: string
}): LeadSummary {
  const baseName = path.basename(input.fileName, '.md')
  const slug = baseName.replace(/^lead-/, '')
  const title =
    input.raw.match(/^title:\s+"?(.+?)"?$/m)?.[1] ??
    input.raw.match(/^#\s+(.+)$/m)?.[1] ??
    slug
  const status = input.raw.match(/^status:\s+(.+)$/m)?.[1]?.trim() ?? 'draft'

  return {
    slug,
    title: title.trim(),
    status,
  }
}
