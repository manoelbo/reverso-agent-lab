import { openrouter } from '@openrouter/ai-sdk-provider';

const DEFAULT_MODEL = 'google/gemini-2.5-flash';

export function getModel(modelId?: string) {
  return openrouter(modelId ?? process.env.AGENT_MODEL ?? DEFAULT_MODEL);
}

export function getAgentConfig() {
  return {
    model: process.env.AGENT_MODEL ?? DEFAULT_MODEL,
    autoAccept: process.env.AGENT_AUTO_ACCEPT === 'true',
    filesystemDir: process.env.AGENT_FILESYSTEM_DIR ?? '../agent/filesystem',
    selfRepairEnabled: process.env.AGENT_SELF_REPAIR === 'true',
    selfRepairMaxRounds: parseInt(process.env.AGENT_SELF_REPAIR_ROUNDS ?? '1', 10),
    maxOutputTokens: parseInt(process.env.AGENT_MAX_OUTPUT_TOKENS ?? '16000', 10),
  };
}
