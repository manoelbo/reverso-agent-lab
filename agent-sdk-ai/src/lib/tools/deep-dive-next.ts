import { tool } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { resolveAgentPaths } from '../filesystem/paths';
import { fileExists, listLeadSummaries } from '../filesystem/io';

export const deepDiveNextTool = tool({
  description:
    'Continue an active deep-dive session. Process the user response to lead suggestions: accept leads for inquiry, reject leads, or request a new deep-dive.',
  inputSchema: z.object({
    userResponse: z
      .string()
      .describe('The user response to the deep-dive suggestions (e.g., "accept all", "reject lead-1", "redo")'),
  }),
  execute: async ({ userResponse }) => {
    const paths = resolveAgentPaths();
    const sessionPath = path.join(paths.outputDir, 'deep-dive-session.json');

    // Check for active session
    if (!(await fileExists(sessionPath))) {
      return {
        ok: false,
        error: 'No active deep-dive session found. Start a new deep-dive first.',
      };
    }

    let session: {
      stage: string;
      suggestedLeads?: Array<{ slug: string; title: string; description: string }>;
      updatedAt: string;
    };
    try {
      const raw = await readFile(sessionPath, 'utf8');
      session = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Failed to load deep-dive session.' };
    }

    const normalized = userResponse.toLowerCase().trim();

    // Parse user intent
    if (
      normalized.includes('aceita tudo') ||
      normalized.includes('aceitar tudo') ||
      normalized.includes('accept all') ||
      normalized.includes('pode investigar') ||
      normalized.includes('plano de todos') ||
      normalized.includes('investigar todos')
    ) {
      // Accept all leads → mark session as awaiting_inquiry_execution
      session.stage = 'awaiting_inquiry_execution';
      session.updatedAt = new Date().toISOString();
      await writeFile(sessionPath, JSON.stringify(session, null, 2));

      const leads = await listLeadSummaries(paths.leadsDir);
      return {
        ok: true,
        action: 'accept_all',
        message: 'All suggested leads accepted. Ready for inquiry execution.',
        leads: leads.map((l) => ({ slug: l.slug, title: l.title, status: l.status })),
      };
    }

    if (
      normalized.includes('refaz') ||
      normalized.includes('descarta') ||
      normalized.includes('redo') ||
      normalized.includes('discard') ||
      normalized.includes('novo deep-dive')
    ) {
      // Discard and redo → clear session
      await writeFile(
        sessionPath,
        JSON.stringify({ stage: 'completed', updatedAt: new Date().toISOString() }),
      );

      return {
        ok: true,
        action: 'redo',
        message:
          'Session discarded. You can start a new deep-dive with different focus, or propose your own hypothesis.',
      };
    }

    if (normalized.includes('rejeit') || normalized.includes('reject')) {
      // Reject — could be specific or all
      session.stage = 'completed';
      session.updatedAt = new Date().toISOString();
      await writeFile(sessionPath, JSON.stringify(session, null, 2));

      return {
        ok: true,
        action: 'reject',
        message:
          'Leads rejected. You can start a new deep-dive with different focus, or propose your own investigation hypothesis.',
      };
    }

    // Default: interpret as a modification or specific selection
    return {
      ok: true,
      action: 'custom_response',
      userResponse,
      message:
        'I received your response. Please be more specific: "accept all", "reject", or describe which leads you want to modify.',
      currentLeads: session.suggestedLeads ?? [],
    };
  },
});
