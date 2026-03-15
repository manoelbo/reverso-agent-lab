import { tool } from 'ai';
import { z } from 'zod';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { resolveAgentPaths } from '../filesystem/paths';
import { listLeadSummaries, listMarkdownFilenames, fileExists, limitText } from '../filesystem/io';

export const readFilesystemTool = tool({
  description:
    'Read data from the investigation filesystem: agent context, previews, leads, dossier entries, allegations, findings, or source status.',
  inputSchema: z.object({
    target: z
      .enum([
        'agent-context',
        'previews',
        'leads',
        'lead-detail',
        'allegations',
        'findings',
        'dossier-people',
        'dossier-groups',
        'dossier-places',
        'source-status',
      ])
      .describe('What data to read from the filesystem'),
    slug: z
      .string()
      .optional()
      .describe('Optional slug for specific items (e.g., lead slug, person name)'),
  }),
  execute: async ({ target, slug }) => {
    const paths = resolveAgentPaths();

    switch (target) {
      case 'agent-context': {
        const agentPath = path.join(paths.outputDir, 'agent.md');
        if (!(await fileExists(agentPath))) {
          return { found: false, message: 'agent.md does not exist. Run init first.' };
        }
        const content = await readFile(agentPath, 'utf8');
        return { found: true, content: limitText(content, 5000) };
      }

      case 'previews': {
        try {
          const entries = await readdir(paths.sourceArtifactsDir);
          const previews: Array<{ docId: string; excerpt: string }> = [];
          for (const docId of entries.slice(0, 10)) {
            const previewPath = path.join(paths.sourceArtifactsDir, docId, 'preview.md');
            try {
              const content = await readFile(previewPath, 'utf8');
              previews.push({ docId, excerpt: limitText(content, 500) });
            } catch {
              continue;
            }
          }
          return { count: entries.length, previews };
        } catch {
          return { count: 0, previews: [] };
        }
      }

      case 'leads': {
        const leads = await listLeadSummaries(paths.leadsDir);
        return { count: leads.length, leads };
      }

      case 'lead-detail': {
        if (!slug) return { error: 'slug is required for lead-detail' };
        const leadPath = path.join(paths.leadsDir, `lead-${slug}.md`);
        try {
          const content = await readFile(leadPath, 'utf8');
          return { found: true, slug, content: limitText(content, 8000) };
        } catch {
          return { found: false, slug, message: `Lead lead-${slug}.md not found.` };
        }
      }

      case 'allegations': {
        const items = await listMarkdownFilenames(paths.allegationsDir);
        if (slug) {
          const filtered = items.filter((name) => name.startsWith(slug));
          const details: Array<{ name: string; content: string }> = [];
          for (const name of filtered.slice(0, 10)) {
            try {
              const content = await readFile(path.join(paths.allegationsDir, `${name}.md`), 'utf8');
              details.push({ name, content: limitText(content, 2000) });
            } catch {
              continue;
            }
          }
          return { count: filtered.length, items: details };
        }
        return { count: items.length, items: items.slice(0, 20) };
      }

      case 'findings': {
        const items = await listMarkdownFilenames(paths.findingsDir);
        if (slug) {
          const filtered = items.filter((name) => name.startsWith(slug));
          const details: Array<{ name: string; content: string }> = [];
          for (const name of filtered.slice(0, 10)) {
            try {
              const content = await readFile(path.join(paths.findingsDir, `${name}.md`), 'utf8');
              details.push({ name, content: limitText(content, 2000) });
            } catch {
              continue;
            }
          }
          return { count: filtered.length, items: details };
        }
        return { count: items.length, items: items.slice(0, 20) };
      }

      case 'dossier-people': {
        const items = await listMarkdownFilenames(paths.dossierPeopleDir);
        if (slug) {
          const filePath = path.join(paths.dossierPeopleDir, `${slug}.md`);
          try {
            const content = await readFile(filePath, 'utf8');
            return { found: true, content: limitText(content, 4000) };
          } catch {
            return { found: false, message: `Person ${slug} not found.` };
          }
        }
        return { count: items.length, items: items.slice(0, 30) };
      }

      case 'dossier-groups': {
        const items = await listMarkdownFilenames(paths.dossierGroupsDir);
        return { count: items.length, items: items.slice(0, 30) };
      }

      case 'dossier-places': {
        const items = await listMarkdownFilenames(paths.dossierPlacesDir);
        return { count: items.length, items: items.slice(0, 30) };
      }

      case 'source-status': {
        const { detectSystemState } = await import('../filesystem/state-detector');
        const state = await detectSystemState(paths);
        return {
          totalFiles: state.totalSourceFiles,
          processed: state.processedFiles.map((f) => f.fileName),
          unprocessed: state.unprocessedFiles.map((f) => f.fileName),
          failed: state.failedFiles.map((f) => ({ name: f.fileName, error: f.error })),
        };
      }

      default:
        return { error: `Unknown target: ${target}` };
    }
  },
});
