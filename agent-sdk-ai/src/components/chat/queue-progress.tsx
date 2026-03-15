'use client'

import {
  Queue,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
} from '@/components/ai-elements/queue'

interface QueueProgressProps {
  steps: string[]
  currentStep: number
  totalSteps: number
}

export function QueueProgress({ steps, currentStep, totalSteps }: QueueProgressProps) {
  return (
    <Queue>
      <div className="px-1 pb-1 text-xs font-medium text-muted-foreground">
        Fila ({Math.min(currentStep + 1, totalSteps)}/{totalSteps})
      </div>
      <ul className="space-y-0.5">
        {steps.map((step, stepIndex) => (
          <QueueItem key={`${stepIndex}-${step}`}>
            <div className="flex items-center gap-2">
              <QueueItemIndicator completed={stepIndex < currentStep} />
              <QueueItemContent
                completed={stepIndex < currentStep}
                className={stepIndex === currentStep ? 'font-semibold text-foreground' : ''}
              >
                {step}
              </QueueItemContent>
            </div>
          </QueueItem>
        ))}
      </ul>
    </Queue>
  )
}
