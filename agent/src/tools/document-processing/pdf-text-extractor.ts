import { readFile } from 'node:fs/promises'

/**
 * Extrai texto bruto de um PDF localmente usando pdfjs-dist.
 * Executa sem chamadas de API para suportar PDFs grandes.
 */
export async function extractTextFromPdf(pdfPath: string): Promise<string> {
  const pdfBytes = await readFile(pdfPath)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes)
  })
  const pdf = await loadingTask.promise

  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    if (pageText.length > 0) {
      pages.push(pageText)
    }
  }

  return pages.join('\n\n')
}
