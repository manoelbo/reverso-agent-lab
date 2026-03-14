// @ts-nocheck
export interface LabArgs {
  inputPdfPath: string
  outputRootPath: string
  model: string
  /** Modo de processamento: "standard" (Gemini native, 8 etapas) ou "deep" (Mistral OCR, replica). */
  mode: 'standard' | 'deep'
  /** Modelo usado para preview e metadata (padrão: google/gemini-2.5-flash). */
  previewModel?: string
  maxPages?: number
  /** Páginas por chunk no OCR (default 5). */
  chunkPages: number
  /** Requisições OpenRouter em paralelo (default 15). */
  concurrency: number
  /** Retomar a partir do checkpoint em caso de falha/restart (default true). */
  resume: boolean
  /** Se true, grava a resposta bruta da API (message + annotations) em openrouter-debug-*.json no outputDir. */
  debugOpenRouter?: boolean
  /** Preferência de roteamento OpenRouter: "latency" (mais rápido), "throughput" ou "price". */
  providerSort?: 'latency' | 'throughput' | 'price'
  /** Language for generated artifacts. "source" keeps source document language. */
  artifactLanguage?: 'source' | 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it'
}

export interface LabConfig extends LabArgs {
  apiKey: string
  pdfSlug: string
  outputDir: string
  /** Diretório de artefatos por chunk. */
  chunksDir: string
  /** Caminho do checkpoint para resume. */
  checkpointPath: string
  replicaPath: string
  previewPath: string
  metadataPath: string
  reportPath: string
}

export interface OpenRouterUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface OpenRouterChatResult {
  content: string
  usage: OpenRouterUsage
  rawModel?: string
}

export interface PreviewMetadataResult {
  preview: string
  metadata: string
  usage: OpenRouterUsage
}

export interface RunReport {
  startedAt: string
  finishedAt: string
  elapsedMs: number
  inputPdfPath: string
  outputDir: string
  model: string
  previewModel?: string
  totalPagesInPdf?: number
  totalChunks?: number
  warnings: string[]
  usage: OpenRouterUsage
}

/** Status de um chunk no checkpoint (mistral-ocr). */
export type ChunkStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ChunkProgress {
  index: number
  startPage: number
  endPage: number
  status: ChunkStatus
  attempts?: number
  error?: string
  finishedAt?: string
  usage?: OpenRouterUsage
}

export interface OcrCheckpoint {
  pdfPath: string
  totalPages: number
  totalChunks: number
  chunkPages: number
  chunks: ChunkProgress[]
  startedAt: string
  updatedAt: string
  /** Status da geração do preview (após réplica). */
  previewStatus?: 'pending' | 'running' | 'done' | 'failed'
  /** Status da geração do metadata (após preview). */
  metadataStatus?: 'pending' | 'running' | 'done' | 'failed'
  previewFinishedAt?: string
  metadataFinishedAt?: string
  previewError?: string
  metadataError?: string
}

export interface OcrProgressEvent {
  stage: 'chunk_ocr'
  current: number
  total: number
  percent: number
  etaMs?: number
  currentPackage?: string
}

/** Status de um arquivo no checkpoint global da pasta source. */
export type SourceFileStatus =
  | 'not_processed'
  | 'replica_running'
  | 'preview_metadata_running'
  | 'done'
  | 'failed'

/** Entrada por arquivo no checkpoint global. */
export interface SourceFileEntry {
  docId: string
  originalFileName: string
  sourcePath: string
  fileType: string
  artifactDir: string
  selected: boolean
  status: SourceFileStatus
  /** Quando o usuário pediu processamento (process-all/process-selected). Ausente = não está na fila. */
  queuedAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
  /** Se true, pode retomar do checkpoint interno do documento. */
  resumeFromCheckpoint?: boolean
  /** Modo de processamento usado para este documento. */
  processingMode?: 'standard' | 'deep'
  /** Quantidade de tentativas de processamento executadas para este documento. */
  attemptCount?: number
  /** Timestamp da última tentativa executada. */
  lastAttemptAt?: string
  /** Próxima tentativa planejada pelo runner (quando houver retry pendente). */
  nextRetryAt?: string
  processingSummary?: {
    totalPagesInPdf?: number
    totalChunks?: number
    usage?: OpenRouterUsage
    model?: string
    previewModel?: string
  }
}

/** Checkpoint global da pasta source. */
export interface SourceCheckpoint {
  version: number
  sourceDir: string
  updatedAt: string
  lastRunAt?: string
  queueStatus?: 'idle' | 'running'
  files: SourceFileEntry[]
}

/** Modo de fila para process-all / process-selected / process-queue. */
export type QueueMode = 'all' | 'selected' | 'queue'

/** Modo de processamento de documento. */
export type ProcessingMode = 'standard' | 'deep'
