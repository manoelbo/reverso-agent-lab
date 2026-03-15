import { ToolLoopAgent, stepCountIs } from 'ai';
import type { UIMessage } from 'ai';
import { getModel } from '../config';
import { resolveAgentPaths } from '../filesystem/paths';
import { detectSystemState } from '../filesystem/state-detector';
import { buildDynamicSystemPrompt } from '../prompts/system-prompt';
import { fileExists } from '../filesystem/io';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

// Import all tools
import { checkSystemStateTool } from '../tools/check-system-state';
import { processDocumentsTool } from '../tools/process-documents';
import { initContextTool } from '../tools/init-context';
import { readFilesystemTool } from '../tools/read-filesystem';
import { deepDiveTool } from '../tools/deep-dive';
import { createLeadTool } from '../tools/create-lead';
import { runInquiryTool } from '../tools/run-inquiry';
import { deepDiveNextTool } from '../tools/deep-dive-next';
import { updateAgentContextTool } from '../tools/update-agent-context';
import { quickResearchTool } from '../tools/quick-research';

/**
 * All tools available to the Reverso agent.
 */
export const reversoTools = {
  checkSystemState: checkSystemStateTool,
  processDocuments: processDocumentsTool,
  initContext: initContextTool,
  readFilesystem: readFilesystemTool,
  deepDive: deepDiveTool,
  createLead: createLeadTool,
  runInquiry: runInquiryTool,
  deepDiveNext: deepDiveNextTool,
  updateAgentContext: updateAgentContextTool,
  quickResearch: quickResearchTool,
};

/**
 * Create a Reverso agent instance with dynamic system prompt.
 * Called per-request to get fresh system state.
 */
export async function createReversoAgent() {
  const paths = resolveAgentPaths();
  const state = await detectSystemState(paths);

  // Load agent.md if it exists
  let agentMd: string | undefined;
  const agentMdPath = path.join(paths.outputDir, 'agent.md');
  if (await fileExists(agentMdPath)) {
    try {
      agentMd = await readFile(agentMdPath, 'utf8');
    } catch {
      // ok
    }
  }

  const instructions = buildDynamicSystemPrompt(state, agentMd);

  return new ToolLoopAgent({
    model: getModel(),
    instructions,
    tools: reversoTools,
    stopWhen: stepCountIs(15),
    temperature: 0.3,
    maxOutputTokens: 16000,
  });
}

// Use the base UIMessage type for simplicity — avoids complex type inference issues
export type ReversoUIMessage = UIMessage;
