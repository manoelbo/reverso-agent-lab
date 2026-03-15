import { getSystemStateTool } from './get-system-state'
import { processSourcesTool } from './process-sources'
import { initContextTool } from './init-context'
import { deepDiveTool } from './deep-dive'
import { deepDiveNextTool } from './deep-dive-next'
import { createLeadTool } from './create-lead'
import { runInquiryTool } from './run-inquiry'
import { quickResearchTool } from './quick-research'
import { viewDataTool } from './view-data'
import { updateAgentContextTool } from './update-agent-context'

export const reversoTools = {
  getSystemState: getSystemStateTool,
  processSources: processSourcesTool,
  initContext: initContextTool,
  deepDive: deepDiveTool,
  deepDiveNext: deepDiveNextTool,
  createLead: createLeadTool,
  runInquiry: runInquiryTool,
  quickResearch: quickResearchTool,
  viewData: viewDataTool,
  updateAgentContext: updateAgentContextTool,
}

export type ReversoTools = typeof reversoTools
