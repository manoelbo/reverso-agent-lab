export interface QueuePlanInput {
  preflight: string[]
  intent: string
}

export interface QueuePlan {
  steps: string[]
  totalSteps: number
}

export function buildQueuePlan(input: QueuePlanInput): QueuePlan {
  const normalized = input.preflight
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  const finalStep = `Atender intenção: ${input.intent}`
  const steps = [...normalized, finalStep]

  return {
    steps,
    totalSteps: steps.length,
  }
}
