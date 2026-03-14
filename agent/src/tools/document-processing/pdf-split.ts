// @ts-nocheck
import { readFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'

const PAGES_PER_CHUNK = 30

export interface PdfChunk {
  /** 1-based start page (inclusive) */
  startPage: number
  /** 1-based end page (inclusive) */
  endPage: number
  /** PDF bytes for this chunk */
  bytes: Uint8Array
}

/**
 * Lê o PDF e retorna o número total de páginas.
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const bytes = await readFile(pdfPath)
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return doc.getPageCount()
}

/**
 * Divide o PDF em chunks de até PAGES_PER_CHUNK páginas.
 * Se maxTotalPages for definido, considera apenas as primeiras maxTotalPages páginas.
 */
export async function splitPdfIntoChunks(
  pdfPath: string,
  maxPagesPerChunk: number = PAGES_PER_CHUNK,
  maxTotalPages?: number
): Promise<PdfChunk[]> {
  const bytes = await readFile(pdfPath)
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  let totalPages = srcDoc.getPageCount()
  if (maxTotalPages !== undefined && maxTotalPages < totalPages) {
    totalPages = maxTotalPages
  }
  const chunks: PdfChunk[] = []

  for (let start = 0; start < totalPages; start += maxPagesPerChunk) {
    const end = Math.min(start + maxPagesPerChunk, totalPages)
    const chunkDoc = await PDFDocument.create()
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i)
    const copied = await chunkDoc.copyPages(srcDoc, pageIndices)
    copied.forEach((p) => chunkDoc.addPage(p))
    const chunkBytes = await chunkDoc.save()
    chunks.push({
      startPage: start + 1,
      endPage: end,
      bytes: chunkBytes
    })
  }

  return chunks
}
