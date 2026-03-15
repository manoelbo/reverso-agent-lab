interface QueueProgressProps {
  steps: string[]
  currentStep: number
  totalSteps: number
}

export function QueueProgress({ steps, currentStep, totalSteps }: QueueProgressProps) {
  return (
    <div
      style={{
        background: '#1a1f2e',
        border: '1px solid #424f7a',
        borderRadius: 8,
        padding: 8,
      }}
    >
      <strong>
        Fila ({Math.min(currentStep + 1, totalSteps)}/{totalSteps})
      </strong>
      <ol style={{ margin: '6px 0 0 18px' }}>
        {steps.map((step, stepIndex) => (
          <li
            key={`${stepIndex}-${step}`}
            style={{
              color: stepIndex === currentStep ? '#b4d2ff' : 'var(--muted)',
              fontWeight: stepIndex === currentStep ? 600 : 400,
            }}
          >
            {step}
          </li>
        ))}
      </ol>
    </div>
  )
}
