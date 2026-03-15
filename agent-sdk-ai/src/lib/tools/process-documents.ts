import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { resolveAgentPaths } from '../filesystem/paths';

const execAsync = promisify(exec);

export const processDocumentsTool = tool({
  description:
    'Process all unprocessed PDF documents in the source directory. Runs the external document processing pipeline to generate previews, indexes, and metadata for each document. This is a long-running operation.',
  inputSchema: z.object({
    mode: z
      .enum(['standard', 'deep'])
      .default('standard')
      .describe('Processing mode: "standard" for fast previews, "deep" for OCR-based full text'),
  }),
  execute: async ({ mode }) => {
    const paths = resolveAgentPaths();

    // Find the agent CLI directory (parent of filesystem)
    const agentDir = path.resolve(paths.filesystemDir, '..');
    const sourceDir = paths.sourceDir;

    try {
      // Run the doc-process command as an external process
      const cmd = `node ../../node_modules/tsx/dist/cli.mjs src/index.ts doc-process process-all --source "${sourceDir}" --mode ${mode}`;
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: agentDir,
        timeout: 300_000, // 5 min timeout
        env: { ...process.env, AGENT_FILESYSTEM_DIR: path.basename(paths.filesystemDir) },
      });

      return {
        ok: true,
        mode,
        sourceDir,
        output: stdout.slice(-2000), // Last 2000 chars of output
        warnings: stderr ? stderr.slice(-500) : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        mode,
        sourceDir,
        error: message.slice(-1000),
      };
    }
  },
});
