import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources"
import type { MessagePartType } from "@/lib/types"

type SourceRefPart = Extract<MessagePartType, { type: "source-reference" }>

function fallbackDocName(docId: string): string {
  return docId.split("/").pop() ?? docId
}

export function SourcesDisplay({ parts }: { parts: SourceRefPart[] }) {
  // Exibir apenas fontes consultadas (role: 'consulted' ou sem role para retrocompatibilidade)
  // Artefatos criados (role: 'created') nunca aparecem no painel Sources
  const consulted = parts.filter((p) => !p.role || p.role === "consulted")
  const unique = Array.from(new Map(consulted.map((p) => [p.docId, p])).values())
  if (unique.length === 0) return null

  return (
    <Sources>
      <SourcesTrigger count={unique.length} />
      <SourcesContent>
        {unique.map((p) => (
          <Source
            key={p.docId}
            title={p.docName ?? fallbackDocName(p.docId)}
            href="#"
          />
        ))}
      </SourcesContent>
    </Sources>
  )
}
