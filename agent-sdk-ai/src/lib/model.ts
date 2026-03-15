import { gateway } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { resolveConfig } from './config'

export function resolveLanguageModel() {
  const config = resolveConfig()

  if (config.providerMode === 'openrouter' && process.env['OPENROUTER_API_KEY']) {
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      apiKey: process.env['OPENROUTER_API_KEY'],
      baseURL: 'https://openrouter.ai/api/v1',
    })
    return openrouter.chatModel(config.modelId)
  }

  return gateway(config.modelId)
}
