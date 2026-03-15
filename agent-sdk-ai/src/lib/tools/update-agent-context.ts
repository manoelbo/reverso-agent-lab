import { tool } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveAgentPaths } from '../filesystem/paths';
import { writeUtf8, fileExists } from '../filesystem/io';

const SECTION_HISTORY = '## Historico de instrucoes';
const SECTION_ACTIVE = '## Instrucoes ativas';

export const updateAgentContextTool = tool({
  description:
    'Update the investigation context (agent.md) with new instructions or context from the user. Adds to the instruction history and active instructions sections.',
  inputSchema: z.object({
    instruction: z
      .string()
      .describe('The new instruction, context, or description to add to the agent.md file'),
  }),
  execute: async ({ instruction }) => {
    const paths = resolveAgentPaths();
    const agentPath = path.join(paths.outputDir, 'agent.md');

    if (!(await fileExists(agentPath))) {
      return {
        ok: false,
        error: 'agent.md does not exist. Run initContext first to create the investigation context.',
      };
    }

    let content = await readFile(agentPath, 'utf8');

    const now = new Date().toISOString();
    const historyLine = `- ${now}: ${instruction}`;

    // Add to history section
    if (content.includes(SECTION_HISTORY)) {
      const afterHistory = content.indexOf(SECTION_HISTORY) + SECTION_HISTORY.length;
      const nextSection = content.indexOf('\n## ', afterHistory);
      const insertPos = nextSection === -1 ? content.length : nextSection;
      content =
        content.slice(0, insertPos) + '\n' + historyLine + '\n' + content.slice(insertPos);
    } else {
      if (!content.endsWith('\n')) content += '\n';
      content += `\n${SECTION_HISTORY}\n\n${historyLine}\n`;
    }

    // Add to active instructions section
    if (content.includes(SECTION_ACTIVE)) {
      const afterActive = content.indexOf(SECTION_ACTIVE) + SECTION_ACTIVE.length;
      const nextSection = content.indexOf('\n## ', afterActive);
      const endOfSection = nextSection === -1 ? content.length : nextSection;
      const before = content.slice(0, endOfSection);
      const after = content.slice(endOfSection);
      const activeContent = content.slice(afterActive, endOfSection).trim();
      const newActiveContent = activeContent
        ? `${activeContent}\n- ${instruction}`
        : `- ${instruction}`;
      content = before + '\n\n' + newActiveContent + '\n' + after;
    } else {
      if (!content.endsWith('\n')) content += '\n';
      content += `\n${SECTION_ACTIVE}\n\n- ${instruction}\n`;
    }

    await writeUtf8(agentPath, content);

    return {
      ok: true,
      message: 'agent.md updated with new instruction.',
      instruction,
      timestamp: now,
    };
  },
});
