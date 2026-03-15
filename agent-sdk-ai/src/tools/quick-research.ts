import path from 'node:path'
import { readdir } from 'node:fs/promises'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '@/lib/config'
import { readUtf8 } from '@/lib/filesystem'
import { resolveLanguageModel } from '@/lib/model'

interface PreviewDoc {
  docId: string
  fileName: string
  content: string
}

async function loadPreviewDocs(maxDocs = 6): Promise<PreviewDoc[]> {
  const { paths } = resolveConfig()
  const checkpointRaw = await readUtf8(path.join(paths.sourceDir, 'source-checkpoint.json'))
  const docNameById = new Map<string, string>()
  if (checkpointRaw) {
    try {
      const parsed = JSON.parse(checkpointRaw) as {
        files?: Array<{ docId?: string; originalFileName?: string }>
      }
      for (const item of parsed.files ?? []) {
        if (item.docId && item.originalFileName) {
          docNameById.set(item.docId, item.originalFileName)
        }
      }
    } catch {
      // ignora
    }
  }

  let entries: string[] = []
  try {
    entries = await readdir(paths.sourceArtifactsDir)
  } catch {
    return []
  }

  const docs: PreviewDoc[] = []
  for (const docId of entries.slice(0, maxDocs)) {
    const previewPath = path.join(paths.sourceArtifactsDir, docId, 'preview.md')
    const preview = await readUtf8(previewPath)
    if (!preview) continue
    docs.push({
      docId,
      fileName: docNameById.get(docId) ?? docId,
      content: preview.slice(0, 3000),
    })
  }
  return docs
}

export const quickResearchTool = tool({
  description:
    'Responde perguntas específicas com base nos previews processados e informa fontes utilizadas.',
  inputSchema: z.object({
    question: z.string().min(4).max(600),
  }),
  execute: async ({ question }) => {
    const docs = await loadPreviewDocs()
    if (docs.length === 0) {
      return {
        ok: false,
        answer:
          'Não encontrei documentos processados para responder. Posso processar as fontes pendentes primeiro.',
        sources: [],
      }
    }

    const prompt = [
      'Você é o Reverso. Responda objetivamente em Português Brasileiro.',
      'Use SOMENTE as fontes fornecidas. Se não souber, diga claramente.',
      '',
      `Pergunta: ${question}`,
      '',
      'Fontes:',
      ...docs.map(
        (doc, index) =>
          `### Fonte ${index + 1}: ${doc.fileName} (${doc.docId})\n${doc.content}`
      ),
    ].join('\n')

    const response = await generateText({
      model: resolveLanguageModel(),
      prompt,
      maxOutputTokens: 800,
      temperature: 0.1,
    })

    return {
      ok: true,
      answer: response.text.trim(),
      sources: docs.map((doc) => ({
        docId: doc.docId,
        fileName: doc.fileName,
      })),
      usage: response.usage,
    }
  },
})
