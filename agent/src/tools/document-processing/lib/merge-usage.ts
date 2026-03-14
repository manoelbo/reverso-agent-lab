// @ts-nocheck
import type { OpenRouterUsage } from '../types.js'

export function mergeUsage(usages: OpenRouterUsage[]): OpenRouterUsage {
  return usages.reduce<OpenRouterUsage>(
    (acc, current) => ({
      promptTokens: (acc.promptTokens ?? 0) + (current.promptTokens ?? 0),
      completionTokens: (acc.completionTokens ?? 0) + (current.completionTokens ?? 0),
      totalTokens: (acc.totalTokens ?? 0) + (current.totalTokens ?? 0)
    }),
    {}
  )
}
