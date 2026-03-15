import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readUtf8(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return undefined
  }
}

export async function writeUtf8(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, content, 'utf8')
}

export async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  } catch {
    return []
  }
}

export async function listPdfFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .filter(
        (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  } catch {
    return []
  }
}

export async function fileSizeMb(filePath: string): Promise<number> {
  try {
    const info = await stat(filePath)
    return info.size / 1024 / 1024
  } catch {
    return 0
  }
}
