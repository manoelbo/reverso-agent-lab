import { useContext, useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, CheckIcon, XIcon, SearchIcon } from "lucide-react"
import { AgentContext } from "@/providers/agent-provider"
import { useAgentChatStore } from "@/stores/agent-chat-store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import type { MessagePartType } from "@/lib/types"

type LeadPart = Extract<MessagePartType, { type: "lead-suggestion" }>

interface LeadCardProps {
  lead: LeadPart
  onInvestigate: (slug: string) => void
}

function statusVariant(status?: string): "secondary" | "outline" | "destructive" | "default" {
  if (status === "planned") return "default"
  if (status === "rejected") return "destructive"
  return "secondary"
}

function statusLabel(status?: string): string {
  if (status === "planned") return "Planejado"
  if (status === "rejected") return "Rejeitado"
  return "Rascunho"
}

function actionStateLabel(state?: string): string {
  if (state === "accepted") return "Aceito"
  if (state === "rejected") return "Rejeitado"
  return ""
}

export function LeadCard({ lead, onInvestigate }: LeadCardProps) {
  const transport = useContext(AgentContext)
  const updateLeadPartState = useAgentChatStore((s) => s.updateLeadPartState)
  const [planOpen, setPlanOpen] = useState(false)
  const [loading, setLoading] = useState<"investigating" | "rejecting" | null>(null)
  const [postRejectionSuggestions, setPostRejectionSuggestions] = useState<Array<{ id: string; text: string }>>([])
  const [error, setError] = useState<string | null>(null)

  const isRejected = lead.actionState === "rejected"
  const isAccepted = lead.actionState === "accepted"
  const isDone = isRejected || isAccepted

  const handleInvestigate = () => {
    if (isDone || loading) return
    setLoading("investigating")
    updateLeadPartState(lead.slug, "accepted")
    onInvestigate(lead.slug)
    setLoading(null)
  }

  const handleReject = async () => {
    if (isDone || loading || !transport) return
    setLoading("rejecting")
    setError(null)
    try {
      const result = await transport.leadAction(lead.slug, "reject")
      updateLeadPartState(lead.slug, "rejected")
      if (result.allRejected && result.suggestions && result.suggestions.length > 0) {
        setPostRejectionSuggestions(result.suggestions)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rejeitar lead")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="my-2 rounded-lg border bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant={statusVariant(lead.status)} className="text-xs shrink-0">
              {statusLabel(lead.status)}
            </Badge>
            {lead.actionState && lead.actionState !== "pending" && (
              <Badge
                variant={lead.actionState === "accepted" ? "default" : "destructive"}
                className="text-xs shrink-0"
              >
                {actionStateLabel(lead.actionState)}
              </Badge>
            )}
          </div>
          <h4 className="font-medium text-sm leading-snug">{lead.title}</h4>
        </div>

        {/* Action buttons */}
        {!isDone && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={handleInvestigate}
              disabled={loading !== null}
            >
              <SearchIcon className="h-3 w-3" />
              Investigar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1 text-destructive hover:text-destructive"
              onClick={() => void handleReject()}
              disabled={loading !== null}
            >
              {loading === "rejecting" ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <XIcon className="h-3 w-3" />
              )}
              Rejeitar
            </Button>
          </div>
        )}

        {isAccepted && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <CheckIcon className="h-3.5 w-3.5 text-green-500" />
            <span>Investigando</span>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="px-4 pb-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{lead.description}</p>
      </div>

      {/* Inquiry Plan — collapsible */}
      {lead.inquiryPlan && (
        <div className="border-t">
          <Collapsible open={planOpen} onOpenChange={setPlanOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {planOpen ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              Plano de inquiry
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono leading-relaxed bg-muted/30 rounded-md p-3">
                  {lead.inquiryPlan}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 pb-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Post-rejection suggestions */}
      {isRejected && postRejectionSuggestions.length > 0 && (
        <div className="border-t px-4 py-3">
          <p className="text-xs text-muted-foreground mb-2">Todos os leads rejeitados. Próximos passos:</p>
          <Suggestions>
            {postRejectionSuggestions.map((s) => (
              <Suggestion
                key={s.id}
                suggestion={s.text}
                onClick={(text) => onInvestigate(text)}
              />
            ))}
          </Suggestions>
        </div>
      )}
    </div>
  )
}
