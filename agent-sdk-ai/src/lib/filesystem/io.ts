import { mkdir, readdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

// ─── Basic helpers ──────────────────────────────────────────────────────────

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function limitText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...(truncated)';
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

// ─── Preview loading ────────────────────────────────────────────────────────

export interface PreviewItem {
  docId: string;
  documentName: string;
  content: string;
  absolutePath: string;
}

export interface SourceCheckpointFile {
  docId: string;
  originalFileName: string;
  status?: string;
  lastError?: string;
}

export async function readSourceCheckpoint(
  sourceDir: string,
): Promise<Map<string, SourceCheckpointFile>> {
  const checkpointPath = path.join(sourceDir, 'source-checkpoint.json');
  try {
    const raw = await readFile(checkpointPath, 'utf8');
    const data = JSON.parse(raw) as { files?: SourceCheckpointFile[] };
    const map = new Map<string, SourceCheckpointFile>();
    for (const f of data.files ?? []) {
      if (f.docId) map.set(f.docId, f);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function listPreviewCandidates(
  sourceArtifactsDir: string,
  checkpoint: Map<string, SourceCheckpointFile>,
): Promise<Array<{ docId: string; documentName: string; previewPath: string }>> {
  const candidates: Array<{ docId: string; documentName: string; previewPath: string }> = [];
  let entries: string[];
  try {
    entries = await readdir(sourceArtifactsDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    const previewPath = path.join(sourceArtifactsDir, name, 'preview.md');
    if (!(await fileExists(previewPath))) continue;
    const cp = checkpoint.get(name);
    const documentName = cp?.originalFileName ?? name;
    candidates.push({ docId: name, documentName, previewPath });
  }
  return candidates;
}

export async function loadRandomPreviewsWithinBudget(
  sourceArtifactsDir: string,
  sourceDir: string,
  maxTokens: number,
): Promise<{ previews: PreviewItem[]; candidatesCount: number; usedCount: number; estimatedTokens: number }> {
  const checkpoint = await readSourceCheckpoint(sourceDir);
  const candidates = await listPreviewCandidates(sourceArtifactsDir, checkpoint);
  const shuffled = [...candidates].sort(() => Math.random() - 0.5);

  const previews: PreviewItem[] = [];
  let estimatedTokens = 0;

  for (const c of shuffled) {
    if (estimatedTokens >= maxTokens) break;
    try {
      const content = await readFile(c.previewPath, 'utf8');
      const tokens = estimateTokens(content);
      if (estimatedTokens + tokens > maxTokens && previews.length > 0) break;
      previews.push({
        docId: c.docId,
        documentName: c.documentName,
        content,
        absolutePath: c.previewPath,
      });
      estimatedTokens += tokens;
    } catch {
      continue;
    }
  }

  return {
    previews,
    candidatesCount: candidates.length,
    usedCount: previews.length,
    estimatedTokens,
  };
}

export async function loadPreviewsIncremental(
  sourceArtifactsDir: string,
  sourceDir: string,
): Promise<{ previews: PreviewItem[] }> {
  const checkpoint = await readSourceCheckpoint(sourceDir);
  const candidates = await listPreviewCandidates(sourceArtifactsDir, checkpoint);

  const previews: PreviewItem[] = [];
  for (const c of candidates) {
    try {
      const content = await readFile(c.previewPath, 'utf8');
      previews.push({
        docId: c.docId,
        documentName: c.documentName,
        content,
        absolutePath: c.previewPath,
      });
    } catch {
      continue;
    }
  }

  return { previews };
}

// ─── Filesystem scanning ────────────────────────────────────────────────────

export async function scanSourceFiles(
  sourceDir: string,
): Promise<Array<{ docId: string; originalFileName: string }>> {
  const checkpoint = await readSourceCheckpoint(sourceDir);
  const result: Array<{ docId: string; originalFileName: string }> = [];

  // Scan physical files (PDFs)
  let entries: string[];
  try {
    entries = await readdir(sourceDir);
  } catch {
    return [];
  }

  for (const name of entries) {
    if (name.startsWith('.') || name === 'source-checkpoint.json' || name === 'README.md') continue;
    // For known docIds from checkpoint, use those
    // Otherwise treat filename-based entries
  }

  // Use checkpoint as source of truth for docId mapping
  for (const [docId, file] of checkpoint) {
    result.push({ docId, originalFileName: file.originalFileName });
  }

  return result;
}

// ─── Lead/investigation file helpers ────────────────────────────────────────

export async function listLeadSummaries(
  leadsDir: string,
): Promise<Array<{ slug: string; title: string; description: string; status: 'draft' | 'planned' }>> {
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await readdir(leadsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const leads: Array<{ slug: string; title: string; description: string; status: 'draft' | 'planned' }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const leadPath = path.join(leadsDir, entry.name);
    try {
      const raw = await readFile(leadPath, 'utf8');
      const title =
        raw.match(/^title:\s+"?(.+?)"?$/m)?.[1]?.trim() ??
        raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
        entry.name.replace(/^lead-/, '').replace(/\.md$/, '');
      const statusRaw = raw.match(/^status:\s+(.+)$/m)?.[1]?.trim().toLowerCase() ?? 'draft';
      const status: 'draft' | 'planned' = statusRaw === 'planned' ? 'planned' : 'draft';
      const description = raw.match(/^description:\s+"?(.+?)"?$/m)?.[1]?.trim() ?? '';
      leads.push({
        slug: entry.name.replace(/^lead-/, '').replace(/\.md$/, ''),
        title,
        description,
        status,
      });
    } catch {
      continue;
    }
  }

  return leads.sort((a, b) => a.title.localeCompare(b.title));
}

export async function listMarkdownFilenames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => e.name.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}
