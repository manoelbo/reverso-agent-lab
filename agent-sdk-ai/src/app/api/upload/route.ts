import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { ensureDir, exists } from '@/lib/filesystem'
import { resolveConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RejectedFile {
  fileName: string
  reason: string
}

export async function POST(req: Request): Promise<Response> {
  const config = resolveConfig()
  const formData = await req.formData()
  const files = formData.getAll('files')

  await ensureDir(config.paths.sourceDir)

  const accepted: string[] = []
  const rejected: RejectedFile[] = []

  for (const item of files) {
    if (!(item instanceof File)) {
      continue
    }

    const fileName = item.name
    const isPdfMime =
      item.type === 'application/pdf' ||
      fileName.toLowerCase().endsWith('.pdf') ||
      item.type === ''

    if (!isPdfMime) {
      rejected.push({ fileName, reason: 'Formato não suportado (apenas PDF).' })
      continue
    }

    const destinationPath = path.join(config.paths.sourceDir, fileName)
    if (await exists(destinationPath)) {
      rejected.push({ fileName, reason: 'Arquivo já existe na source.' })
      continue
    }

    const buffer = Buffer.from(await item.arrayBuffer())
    await writeFile(destinationPath, buffer)
    accepted.push(fileName)
  }

  return Response.json({
    accepted,
    rejected,
  })
}
