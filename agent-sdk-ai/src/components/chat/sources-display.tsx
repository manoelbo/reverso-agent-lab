interface SourcesDisplayProps {
  source: unknown
}

function prettySource(source: unknown): string {
  if (typeof source !== 'object' || source === null) return String(source)
  const value = source as Record<string, unknown>
  if (typeof value['title'] === 'string') return value['title']
  if (typeof value['url'] === 'string') return value['url']
  if (typeof value['id'] === 'string') return value['id']
  return JSON.stringify(source)
}

export function SourcesDisplay({ source }: SourcesDisplayProps) {
  return <div style={{ color: 'var(--muted)' }}>Fonte: {prettySource(source)}</div>
}
