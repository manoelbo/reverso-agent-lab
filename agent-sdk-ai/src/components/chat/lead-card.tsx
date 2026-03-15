'use client'

import { Button } from '@/components/ui/button'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanFooter,
} from '@/components/ai-elements/plan'

interface LeadCardProps {
  title: string
  description?: string
  onInvestigate: () => void
  onReject: () => void
}

export function LeadCard({ title, description, onInvestigate, onReject }: LeadCardProps) {
  return (
    <Plan defaultOpen>
      <PlanHeader>
        <PlanTitle>{title}</PlanTitle>
      </PlanHeader>
      {description ? (
        <div className="px-4 pb-2 text-sm text-muted-foreground">{description}</div>
      ) : null}
      <PlanFooter>
        <div className="flex w-full items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={onInvestigate}
          >
            Investigar
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onReject}
          >
            Rejeitar
          </Button>
        </div>
      </PlanFooter>
    </Plan>
  )
}
