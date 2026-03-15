'use client'

import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from '@/components/ai-elements/sources'

interface SourceItem {
  title?: string
  url?: string
  id?: string
}

interface SourcesDisplayProps {
  sources: SourceItem[]
}

function prettySourceTitle(source: SourceItem): string {
  return source.title ?? source.url ?? source.id ?? 'Fonte'
}

export function SourcesDisplay({ sources }: SourcesDisplayProps) {
  if (sources.length === 0) return null

  return (
    <Sources>
      <SourcesTrigger count={sources.length} />
      <SourcesContent>
        {sources.map((source, idx) => (
          <Source
            key={source.id ?? idx}
            href={source.url}
            title={prettySourceTitle(source)}
          />
        ))}
      </SourcesContent>
    </Sources>
  )
}
