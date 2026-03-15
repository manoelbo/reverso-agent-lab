import path from 'node:path';
import {
  fileExists,
  readSourceCheckpoint,
  scanSourceFiles,
  listLeadSummaries,
} from './io';
import type { AgentPaths } from './paths';

export interface FileInfo {
  docId: string;
  fileName: string;
  error?: string;
}

export interface LeadSummary {
  slug: string;
  title: string;
  description: string;
  status: 'draft' | 'planned';
}

export interface SystemState {
  sourceEmpty: boolean;
  unprocessedFiles: FileInfo[];
  processedFiles: FileInfo[];
  failedFiles: FileInfo[];
  totalSourceFiles: number;
  hasAgentContext: boolean;
  isFirstVisit: boolean;
  hasDeepDiveSession: boolean;
  sessionStage?: string;
  leads: LeadSummary[];
  hasPreviewsWithoutInit: boolean;
}

export async function detectSystemState(paths: AgentPaths): Promise<SystemState> {
  // 1. Load checkpoint
  const checkpoint = await readSourceCheckpoint(paths.sourceDir);

  // 2. Categorize files
  const unprocessedFiles: FileInfo[] = [];
  const processedFiles: FileInfo[] = [];
  const failedFiles: FileInfo[] = [];

  for (const [docId, file] of checkpoint) {
    const status = file.status ?? 'not_processed';
    if (status === 'done') {
      processedFiles.push({ docId, fileName: file.originalFileName });
    } else if (status === 'failed') {
      failedFiles.push({
        docId,
        fileName: file.originalFileName,
        ...(file.lastError ? { error: file.lastError } : {}),
      });
    } else {
      unprocessedFiles.push({ docId, fileName: file.originalFileName });
    }
  }

  // 3. Agent context (agent.md)
  const hasAgentContext = await fileExists(path.join(paths.outputDir, 'agent.md'));

  // 4. First visit heuristic
  const isFirstVisit = !hasAgentContext;

  // 5. Deep-dive session
  let hasDeepDiveSession = false;
  let sessionStage: string | undefined;
  try {
    const sessionPath = path.join(paths.outputDir, 'deep-dive-session.json');
    if (await fileExists(sessionPath)) {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(sessionPath, 'utf8');
      const session = JSON.parse(raw) as { stage?: string; updatedAt?: string };
      if (
        session.stage === 'awaiting_plan_decision' ||
        session.stage === 'awaiting_inquiry_execution'
      ) {
        const updatedMs = Date.parse(session.updatedAt ?? '');
        const staleAfterMs = 1000 * 60 * 60 * 72; // 72h
        if (Number.isFinite(updatedMs) && Date.now() - updatedMs <= staleAfterMs) {
          hasDeepDiveSession = true;
          sessionStage = session.stage;
        }
      }
    }
  } catch {
    // no session — ok
  }

  // 6. Leads
  const leads = await listLeadSummaries(paths.leadsDir);

  const totalSourceFiles = checkpoint.size;
  const sourceEmpty = totalSourceFiles === 0;
  const hasPreviewsWithoutInit = processedFiles.length > 0 && !hasAgentContext;

  return {
    sourceEmpty,
    unprocessedFiles,
    processedFiles,
    failedFiles,
    totalSourceFiles,
    hasAgentContext,
    isFirstVisit,
    hasDeepDiveSession,
    ...(sessionStage ? { sessionStage } : {}),
    leads,
    hasPreviewsWithoutInit,
  };
}
