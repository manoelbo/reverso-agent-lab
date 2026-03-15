export interface InquiryPanelData {
  lead: string
  verifiedFindingsCount: number
  reviewQueueCount: number
  allegations: Array<{ id: string; statement: string }>
  verifiedItems: Array<{ id: string; claim: string }>
  reviewItems: Array<{ id: string; claim: string }>
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseList(
  value: unknown,
  mapper: (item: Record<string, unknown>) => { id: string; claimOrStatement: string }
): Array<{ id: string; claimOrStatement: string }> {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined
      return mapper(item as Record<string, unknown>)
    })
    .filter((item): item is { id: string; claimOrStatement: string } => Boolean(item))
    .filter((item) => item.id.length > 0 && item.claimOrStatement.length > 0)
}

export function parseInquiryPanelData(output: unknown): InquiryPanelData | undefined {
  if (!output || typeof output !== 'object') return undefined
  const value = output as Record<string, unknown>
  if (!value['evidenceGate'] || typeof value['evidenceGate'] !== 'object') return undefined
  const gate = value['evidenceGate'] as Record<string, unknown>

  const allegationsRaw = value['inquirySummary']
  const summary =
    allegationsRaw && typeof allegationsRaw === 'object'
      ? (allegationsRaw as Record<string, unknown>)
      : undefined

  const allegations = parseList(summary?.['allegations'], (item) => ({
    id: asString(item['id']),
    claimOrStatement: asString(item['statement']),
  })).map((item) => ({ id: item.id, statement: item.claimOrStatement }))

  const verifiedItems = parseList(summary?.['verifiedFindings'], (item) => ({
    id: asString(item['id']),
    claimOrStatement: asString(item['claim']),
  })).map((item) => ({ id: item.id, claim: item.claimOrStatement }))

  const reviewItems = parseList(summary?.['reviewFindings'], (item) => ({
    id: asString(item['id']),
    claimOrStatement: asString(item['claim']),
  })).map((item) => ({ id: item.id, claim: item.claimOrStatement }))

  return {
    lead: asString(value['lead'], 'lead'),
    verifiedFindingsCount: asNumber(gate['verifiedFindings'], verifiedItems.length),
    reviewQueueCount: asNumber(gate['reviewQueue'], reviewItems.length),
    allegations,
    verifiedItems,
    reviewItems,
  }
}
