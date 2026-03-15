import { ToolLoopAgent, stepCountIs } from 'ai'
import { z } from 'zod'
import { resolveLanguageModel } from '@/lib/model'
import { reversoTools } from '@/tools'

export interface CreateReversoAgentInput {
  dynamicInstructions: string
}

export function createReversoAgent(input: CreateReversoAgentInput) {
  return new ToolLoopAgent({
    model: resolveLanguageModel(),
    instructions: input.dynamicInstructions,
    tools: reversoTools,
    stopWhen: stepCountIs(10),
    temperature: 0.1,
    callOptionsSchema: z.object({
      autoAccept: z.boolean().default(false),
    }),
    prepareCall: ({ options, ...base }) => ({
      ...base,
      experimental_context: {
        autoAccept: options?.autoAccept ?? false,
      },
    }),
  })
}
