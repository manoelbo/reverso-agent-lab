export function formatFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```\s*$/);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}
