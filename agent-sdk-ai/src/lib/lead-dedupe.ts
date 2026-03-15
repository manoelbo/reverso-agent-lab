export interface CandidateLead {
  title: string
  description?: string
}

export interface ExistingLead {
  slug?: string
  title: string
}

export interface DedupeDecision {
  lead: CandidateLead
  duplicated: boolean
  matchedWith?: string
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function similarityByTokenOverlap(a: string, b: string): number {
  const aTokens = new Set(normalize(a).split(' ').filter(Boolean))
  const bTokens = new Set(normalize(b).split(' ').filter(Boolean))
  if (aTokens.size === 0 || bTokens.size === 0) return 0

  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length
  const union = new Set([...aTokens, ...bTokens]).size
  return intersection / union
}

export function dedupeLeadCandidates(
  candidates: CandidateLead[],
  existing: ExistingLead[],
  threshold = 0.72
): DedupeDecision[] {
  return candidates.map((lead) => {
    const exact = existing.find(
      (item) => normalize(item.title) === normalize(lead.title)
    )
    if (exact) {
      return {
        lead,
        duplicated: true,
        matchedWith: exact.slug ?? exact.title,
      }
    }

    let bestMatch: ExistingLead | undefined
    let bestScore = 0
    for (const item of existing) {
      const score = similarityByTokenOverlap(lead.title, item.title)
      if (score > bestScore) {
        bestScore = score
        bestMatch = item
      }
    }

    if (bestMatch && bestScore >= threshold) {
      return {
        lead,
        duplicated: true,
        matchedWith: bestMatch.slug ?? bestMatch.title,
      }
    }

    return {
      lead,
      duplicated: false,
    }
  })
}
