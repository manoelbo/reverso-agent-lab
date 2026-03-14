// @ts-nocheck
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import type { LabArgs, LabConfig } from './types.js'

const DEFAULT_MODEL_STANDARD = 'google/gemini-2.0-flash-lite-001'
const DEFAULT_MODEL_DEEP = 'openai/gpt-5-nano'
const DEFAULT_MODEL = DEFAULT_MODEL_STANDARD
const DEFAULT_PREVIEW_MODEL = 'google/gemini-2.5-flash'
const DEFAULT_CHUNK_PAGES = 5
const DEFAULT_CONCURRENCY = 15

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function parseArgs(argv: string[]): LabArgs {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      args[key] = 'true'
      continue
    }
    args[key] = value
    i += 1
  }

  const inputPdfPath = args.input
  if (!inputPdfPath) {
    throw new Error('Argumento obrigatório ausente: --input "<caminho-do-pdf>"')
  }

  const mode: 'standard' | 'deep' = args['mode'] === 'deep' ? 'deep' : 'standard'
  const defaultModel = mode === 'deep' ? DEFAULT_MODEL_DEEP : DEFAULT_MODEL_STANDARD

  return {
    inputPdfPath,
    outputRootPath: args.output ?? 'examples/output',
    mode,
    model: args.model ?? defaultModel,
    previewModel: args['preview-model'] ?? DEFAULT_PREVIEW_MODEL,
    maxPages: args['max-pages'] ? Number(args['max-pages']) : undefined,
    chunkPages: args['chunk-pages'] ? Number(args['chunk-pages']) : DEFAULT_CHUNK_PAGES,
    concurrency: args.concurrency ? Number(args.concurrency) : DEFAULT_CONCURRENCY,
    resume: args.resume !== 'false' && args.resume !== '0',
    debugOpenRouter: args['debug-openrouter'] === 'true' || args['debug-openrouter'] === '1',
    providerSort:
      args['provider-sort'] === 'latency' || args['provider-sort'] === 'throughput' || args['provider-sort'] === 'price'
        ? args['provider-sort']
        : undefined,
    artifactLanguage:
      args['artifact-language'] === 'source' ||
      args['artifact-language'] === 'en' ||
      args['artifact-language'] === 'pt' ||
      args['artifact-language'] === 'es' ||
      args['artifact-language'] === 'fr' ||
      args['artifact-language'] === 'de' ||
      args['artifact-language'] === 'it'
        ? args['artifact-language']
        : undefined
  }
}

function loadEnv(projectRoot: string): void {
  dotenv.config({ path: path.join(projectRoot, '.env.local') })
}

export function getProjectRoot(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const projectRoot = path.resolve(__dirname, '../../../../..')
  loadEnv(projectRoot)
  return projectRoot
}

export function getApiKey(): string {
  getProjectRoot()
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY não encontrado em .env.local')
  }
  return apiKey
}

export function resolveLabConfig(argv: string[]): LabConfig {
  const projectRoot = getProjectRoot()
  const parsed = parseArgs(argv)
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY não encontrado em .env.local')
  }

  if (parsed.maxPages !== undefined && (!Number.isFinite(parsed.maxPages) || parsed.maxPages < 1)) {
    throw new Error('max-pages inválido. Use inteiro >= 1.')
  }
  if (!Number.isFinite(parsed.chunkPages) || parsed.chunkPages < 1 || parsed.chunkPages > 100) {
    throw new Error('chunk-pages inválido. Use inteiro entre 1 e 100.')
  }
  if (!Number.isFinite(parsed.concurrency) || parsed.concurrency < 1 || parsed.concurrency > 20) {
    throw new Error('concurrency inválido. Use inteiro entre 1 e 20.')
  }

  const inputAbsolute = path.resolve(projectRoot, parsed.inputPdfPath)
  const outputRootAbsolute = path.resolve(projectRoot, parsed.outputRootPath)
  const pdfSlug = slugify(path.basename(parsed.inputPdfPath, path.extname(parsed.inputPdfPath)))
  const outputDir = path.join(outputRootAbsolute, pdfSlug)

  return {
    ...parsed,
    apiKey,
    inputPdfPath: inputAbsolute,
    outputRootPath: outputRootAbsolute,
    pdfSlug,
    outputDir,
    chunksDir: path.join(outputDir, 'chunks'),
    checkpointPath: path.join(outputDir, 'checkpoint.json'),
    replicaPath: path.join(outputDir, 'replica.md'),
    previewPath: path.join(outputDir, 'preview.md'),
    metadataPath: path.join(outputDir, 'metadata.md'),
    reportPath: path.join(outputDir, 'run-report.json')
  }
}
