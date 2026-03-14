import { useContext, useState } from "react"
import { CheckIcon, XIcon, ChevronDownIcon, ChevronRightIcon, FileSearchIcon } from "lucide-react"
import { AgentContext } from "@/providers/agent-provider"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { MessagePartType } from "@/lib/types"

type AllegationPart = Extract<MessagePartType, { type: "allegation" }>
type AllegationFinding = AllegationPart["findings"][number]

// ─── FindingItem ────────────────────────────────────────────────────────────

interface FindingItemProps {
  finding: AllegationFinding
  allegationId: string
  onVerify: (id: string) => Promise<void>
  onReject: (id: string) => Promise<void>
  disabled?: boolean
}

function findingStatusBadge(status: AllegationFinding["status"]) {
  if (status === "verified") return { label: "Verificado", variant: "default" as const }
  if (status === "rejected") return { label: "Recusado", variant: "destructive" as const }
  return { label: "Inverificado", variant: "secondary" as const }
}

function FindingItem({ finding, onVerify, onReject, disabled }: FindingItemProps) {
  const [localStatus, setLocalStatus] = useState(finding.status)
  const [loading, setLoading] = useState<"verify" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDone = localStatus === "verified" || localStatus === "rejected"
  const { label, variant } = findingStatusBadge(localStatus)

  const handle = async (action: "verify" | "reject") => {
    if (isDone || loading || disabled) return
    setLoading(action)
    setError(null)
    try {
      if (action === "verify") {
        await onVerify(finding.id)
        setLocalStatus("verified")
      } else {
        await onReject(finding.id)
        setLocalStatus("rejected")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar finding")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-relaxed text-foreground/90">{finding.text}</p>
        {finding.sourceRefs && finding.sourceRefs.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            Fontes: {finding.sourceRefs.join(", ")}
          </p>
        )}
        {error && <p className="text-[10px] text-destructive mt-1">{error}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Badge variant={variant} className="text-[10px] px-1.5 py-0.5 h-auto">
          {label}
        </Badge>
        {!isDone && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
              onClick={() => void handle("verify")}
              disabled={loading !== null || disabled}
              title="Verificar finding"
            >
              {loading === "verify" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <CheckIcon className="h-3 w-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => void handle("reject")}
              disabled={loading !== null || disabled}
              title="Recusar finding"
            >
              {loading === "reject" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <XIcon className="h-3 w-3" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── AllegationDisplay ───────────────────────────────────────────────────────

interface AllegationDisplayProps {
  part: AllegationPart
}

function allegationStatusBadge(status: AllegationPart["status"]) {
  if (status === "accepted") return { label: "Aceita", variant: "default" as const }
  if (status === "rejected") return { label: "Recusada", variant: "destructive" as const }
  return { label: "Pendente", variant: "secondary" as const }
}

export function AllegationDisplay({ part }: AllegationDisplayProps) {
  const transport = useContext(AgentContext)
  const [status, setStatus] = useState(part.status)
  const [findingsOpen, setFindingsOpen] = useState(false)
  const [loading, setLoading] = useState<"accept" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isDone = status === "accepted" || status === "rejected"
  const { label, variant } = allegationStatusBadge(status)

  const handleAllegationAction = async (action: "accept" | "reject") => {
    if (isDone || loading || !transport) return
    setLoading(action)
    setError(null)
    try {
      await transport.allegationAction(part.id, action, part.leadSlug)
      setStatus(action === "accept" ? "accepted" : "rejected")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar alegação")
    } finally {
      setLoading(null)
    }
  }

  const handleFindingVerify = async (findingId: string) => {
    if (!transport) return
    await transport.findingAction(findingId, "verify")
  }

  const handleFindingReject = async (findingId: string) => {
    if (!transport) return
    await transport.findingAction(findingId, "reject")
  }

  return (
    <div className="my-2 rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 shrink-0">
          <FileSearchIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Alegação</span>
            <Badge variant={variant} className="text-xs shrink-0">
              {label}
            </Badge>
          </div>
          <h4 className="font-medium text-sm leading-snug">{part.title}</h4>
        </div>

        {/* Action buttons */}
        {!isDone && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => void handleAllegationAction("accept")}
              disabled={loading !== null}
            >
              {loading === "accept" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <CheckIcon className="h-3 w-3" />
              )}
              Aceitar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive"
              onClick={() => void handleAllegationAction("reject")}
              disabled={loading !== null}
            >
              {loading === "reject" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <XIcon className="h-3 w-3" />
              )}
              Recusar
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Findings list — collapsible */}
      {part.findings.length > 0 && (
        <div className="border-t">
          <Collapsible open={findingsOpen} onOpenChange={setFindingsOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {findingsOpen ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              {part.findings.length} finding{part.findings.length !== 1 ? "s" : ""}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-3">
                {part.findings.map((finding) => (
                  <FindingItem
                    key={finding.id}
                    finding={finding}
                    allegationId={part.id}
                    onVerify={handleFindingVerify}
                    onReject={handleFindingReject}
                    disabled={isDone}
                  />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  )
}
