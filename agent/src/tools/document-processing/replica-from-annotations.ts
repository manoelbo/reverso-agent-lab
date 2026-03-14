// @ts-nocheck
import type { FileAnnotation } from './openrouter-client.js'

/**
 * Extracts replica text from OpenRouter response annotations (Mistral-OCR parsed content).
 * Only 'text' parts are concatenated; image parts are skipped.
 */
export function replicaFromAnnotations(annotations: FileAnnotation[]): string {
  const parts: string[] = []
  for (const ann of annotations) {
    if (ann.type !== 'file' || !Array.isArray(ann.file?.content)) continue
    for (const part of ann.file.content) {
      if (part.type === 'text' && part.text?.trim()) {
        parts.push(part.text.trim())
      }
    }
  }
  return parts.join('\n\n')
}

/**
 * Builds replica Markdown from chatWithPdf result:
 * prefers annotations (OCR-parsed content), fallback to model content.
 */
export function buildReplicaFromPdfResponse(
  content: string,
  annotations: FileAnnotation[]
): string {
  const fromAnnotations = replicaFromAnnotations(annotations)
  if (fromAnnotations.length > 0) return fromAnnotations
  return content.trim()
}
