import type { InferUITools, UIMessage } from 'ai'
import type { ReversoTools } from '@/tools'

export interface ReversoMessageMetadata {
  intent?: string
  confidence?: number
  timestamp?: number
}

export interface ReversoDataParts {
  [key: string]: unknown
  workflow: {
    phase: 'preflight' | 'execution' | 'summary'
    message: string
  }
  queue: {
    steps: string[]
    currentStep: number
    totalSteps: number
  }
  suggestion: {
    title: string
    action: string
  }
}

export type ReversoUIMessage = UIMessage<
  ReversoMessageMetadata,
  ReversoDataParts,
  InferUITools<ReversoTools>
>
