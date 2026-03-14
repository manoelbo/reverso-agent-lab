import { CheckIcon, XIcon } from "lucide-react"
import type { MessagePartType } from "@/lib/types"
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@/components/ai-elements/confirmation"

type ConfirmationPart = Extract<MessagePartType, { type: "confirmation" }>

interface ConfirmationDisplayProps {
  part: ConfirmationPart
  onApprove?: () => void
  onReject?: () => void
}

export function ConfirmationDisplay({ part, onApprove, onReject }: ConfirmationDisplayProps) {
  return (
    <Confirmation approval={{ id: part.requestId }} state={part.state}>
      <ConfirmationTitle>
        <ConfirmationRequest>
          <p className="font-medium">{part.title}</p>
          {part.description && (
            <p className="mt-1 text-muted-foreground">{part.description}</p>
          )}
        </ConfirmationRequest>
        <ConfirmationAccepted>
          <CheckIcon className="size-4" />
          <span>Ação aprovada</span>
        </ConfirmationAccepted>
        <ConfirmationRejected>
          <XIcon className="size-4" />
          <span>Ação rejeitada</span>
        </ConfirmationRejected>
      </ConfirmationTitle>
      <ConfirmationActions>
        <ConfirmationAction variant="outline" onClick={onReject}>
          Rejeitar
        </ConfirmationAction>
        <ConfirmationAction variant="default" onClick={onApprove}>
          Aprovar
        </ConfirmationAction>
      </ConfirmationActions>
    </Confirmation>
  )
}
