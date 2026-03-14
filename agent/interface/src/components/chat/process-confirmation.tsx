import { FileTextIcon, PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ProcessConfirmationProps {
  files: string[]
  onConfirm: () => void
  disabled?: boolean
}

export function ProcessConfirmation({ files, onConfirm, disabled }: ProcessConfirmationProps) {
  return (
    <div className="my-2 overflow-hidden rounded-md border bg-background">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <FileTextIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {files.length} documento{files.length !== 1 ? "s" : ""} pronto{files.length !== 1 ? "s" : ""} para processar
        </span>
      </div>

      <div className="px-3 py-2 space-y-1">
        {files.map((name) => (
          <div key={name} className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileTextIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{name}</span>
          </div>
        ))}
      </div>

      <div className="border-t bg-muted/20 px-3 py-2 flex justify-end">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={disabled}
          className="gap-1.5"
        >
          <PlayIcon className="h-3.5 w-3.5" />
          Processar agora
        </Button>
      </div>
    </div>
  )
}
