import { useState } from "react"
import { CheckIcon, CopyIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MessagePartType } from "@/lib/types"

type ArtifactPart = Extract<MessagePartType, { type: "artifact" }>

interface ArtifactDisplayProps {
  part: ArtifactPart
  className?: string
}

export function ArtifactDisplay({ part, className }: ArtifactDisplayProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(part.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  const shortPath = part.path
    ? part.path.split("/").slice(-2).join("/")
    : undefined

  // Limit preview to first 80 lines to avoid huge renders
  const lines = part.content.split("\n")
  const previewContent = lines.slice(0, 80).join("\n")
  const truncated = lines.length > 80

  return (
    <div className={cn("my-2 overflow-hidden rounded-md border bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{part.title}</span>
          {shortPath && (
            <span className="hidden truncate text-xs text-muted-foreground font-mono sm:block">
              {shortPath}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={handleCopy}
          title="Copiar conteúdo"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="relative max-h-64 overflow-y-auto">
        <pre className="p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap wrap-break-word font-mono">
          {previewContent}
          {truncated && (
            <span className="text-muted-foreground">
              {"\n\n"}… ({lines.length - 80} linhas adicionais)
            </span>
          )}
        </pre>
      </div>
    </div>
  )
}
