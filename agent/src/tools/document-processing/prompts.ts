// @ts-nocheck
/**
 * Prompts for PDF lab pipeline: Mistral-OCR replica, condense, preview, metadata.
 */

export const PREVIEW_SYSTEM_PROMPT = `
You are an editorial analyst. Produce a preview in clear, factual Markdown for investigative use.

This preview will be used by an agent to search for information, quickly understand the document, and decide whether to use the full replica or this summary. Focus on entities and groups that can be investigation targets: key people, companies, places, parties, and important actions. Do not list every name—only the most relevant people and why they matter.

Rules:
- Output in plain Markdown only (no code blocks).
- Do not invent facts; stay neutral and precise.
- If something is ambiguous, note it.
`.trim()

export function buildPreviewUserPrompt(
  replicaMarkdown: string,
  artifactLanguageInstruction: string
): string {
  return `
Based on the full replica below, produce a \`preview.md\` file with this structure:

---
title: "Document preview"
type: "preview"
---

# Executive summary

(Brief overview in a few lines.)

# Key points

# Key people

(List the most important people in the document and why they matter—e.g. representatives, signatories, decision-makers. Focus on investigation-relevant roles, not every name.)

# Groups and categories

(Companies, government bodies, parties, and other groups. Explain how categories apply (e.g. company, government, political_party) and each group's role in the document.)

# Important places

(Places mentioned with relevance—where events occur, worksites, headquarters.)

# Timeline

(Dates and relevant events in order; notable moments.)

# Risks / alerts for investigation

(Potential risks, inconsistencies, or alerts for the investigation.)

${artifactLanguageInstruction}

Replica:
${replicaMarkdown}
`.trim()
}

export const METADATA_SYSTEM_PROMPT = `
You extract structured metadata from document previews for investigative journalism. This metadata is the glue for GraphView and Dossier: it feeds entity nodes, timeline events, and places.

Generate metadata from the preview text provided. Output must be valid YAML frontmatter followed by Markdown sections. Do not wrap the output in code blocks (\`\`\`). Do not invent facts; if uncertain, indicate low confidence.
`.trim()

export function buildMetadataUserPrompt(
  previewMarkdown: string,
  artifactLanguageInstruction: string
): string {
  return `
Based on the preview below, produce a \`metadata.md\` file.

Use YAML frontmatter with these fields:
- title
- document_type
- language
- probable_origin
- confidence
- dates (list) — for Timeline
- entities_mentioned (list of objects): name, type (person | group | place); for groups add category (company | government | political_party | criminal_org | foundation | team) and registration_id when available; for people add role when relevant
- locations (list) — for Places
- monetary_values (list) — amount, currency, context
- tags (list)

After the frontmatter, include these sections:
# Classification evidence
# Extracted entities
# Gaps and ambiguities

Use [[wikilinks]] for entity names in the Extracted entities section when appropriate for the dossier renderer.

${artifactLanguageInstruction}

Preview:
${previewMarkdown}
`.trim()
}

export const CHUNK_CONDENSE_SYSTEM_PROMPT = `
You summarize long chunks of a document replica to reduce context without losing facts.
Return short bullet points in Markdown.
Include only observable facts (dates, parties, values, obligations, signatures, agencies).
`.trim()

/** Prompt for full Markdown transcription when using Mistral-OCR (whole PDF or chunk). */
export const MISTRAL_OCR_REPLICA_USER_PROMPT = `
Transcribe this PDF document in full into Markdown.

Rules:
- Preserve structure: headings, paragraphs, lists, tables (in Markdown syntax).
- Include all text; do not summarize or omit.
- For signatures, stamps, seals, images or other visual elements, describe in one line.
- Output plain Markdown only, no code block and no introductory comment.
`.trim()

export function buildChunkCondenseUserPrompt(index: number, total: number, chunk: string): string {
  return `
Chunk ${index}/${total} of the replica.
Summarize the main facts in objective bullets for later synthesis.

Chunk:
${chunk}
`.trim()
}
