export type LanguageCode = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it'
export type ResponseLanguage = LanguageCode | 'auto'
export type ArtifactLanguage = LanguageCode | 'source'

const SUPPORTED: LanguageCode[] = ['en', 'pt', 'es', 'fr', 'de', 'it']

function normalizeLanguage(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.trim().toLowerCase()
}

export function parseResponseLanguage(value: string | undefined): ResponseLanguage | undefined {
  const v = normalizeLanguage(value)
  if (!v) return undefined
  if (v === 'auto') return 'auto'
  if (SUPPORTED.includes(v as LanguageCode)) return v as LanguageCode
  return undefined
}

export function parseArtifactLanguage(value: string | undefined): ArtifactLanguage | undefined {
  const v = normalizeLanguage(value)
  if (!v) return undefined
  if (v === 'source') return 'source'
  if (SUPPORTED.includes(v as LanguageCode)) return v as LanguageCode
  return undefined
}

export function detectLanguageFromText(text: string | undefined): LanguageCode | undefined {
  if (!text) return undefined
  const normalized = text.toLowerCase()
  if (!normalized.trim()) return undefined

  // Very lightweight heuristic to avoid extra dependencies.
  const ptHints = [
    ' voce ',
    ' você ',
    ' não ',
    ' para ',
    ' investigação',
    ' documento',
    'que ',
    ' idioma',
    ' teste '
  ]
  const esHints = [' usted ', ' para ', ' investigacion', ' documento', ' que ']
  const frHints = [' vous ', ' enquête', ' document', ' pour ', ' le ', ' la ']
  const deHints = [' sie ', ' untersuchung', ' dokument', ' und ', ' der ', ' die ']
  const itHints = [' lei ', ' indagine', ' documento', ' per ', ' che ']

  const score = (hints: string[]): number =>
    hints.reduce((acc, hint) => acc + (normalized.includes(hint) ? 1 : 0), 0)

  const scores: Record<LanguageCode, number> = {
    en: 0,
    pt: score(ptHints),
    es: score(esHints),
    fr: score(frHints),
    de: score(deHints),
    it: score(itHints)
  }

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (!top || top[1] <= 0) return undefined
  return top[0] as LanguageCode
}

export function resolveResponseLanguage(args: {
  mode: ResponseLanguage | undefined
  fallback: LanguageCode
  userText?: string
}): LanguageCode {
  if (args.mode && args.mode !== 'auto') return args.mode
  if (args.mode === 'auto') {
    return detectLanguageFromText(args.userText) ?? args.fallback
  }
  return detectLanguageFromText(args.userText) ?? args.fallback
}

export function resolveResponseLanguageForPrompt(args: {
  mode: ResponseLanguage | undefined
  fallback?: LanguageCode
  userText?: string
}): LanguageCode {
  return resolveResponseLanguage({
    mode: args.mode,
    fallback: args.fallback ?? 'en',
    ...(args.userText ? { userText: args.userText } : {})
  })
}

export function resolveArtifactLanguage(args: {
  mode: ArtifactLanguage | undefined
  fallback: ArtifactLanguage
}): ArtifactLanguage {
  return args.mode ?? args.fallback
}

export function resolveArtifactLanguageForSource(args: {
  mode: ArtifactLanguage | undefined
  sourceLanguage?: LanguageCode
  fallback?: ArtifactLanguage
}): ArtifactLanguage {
  if (args.mode && args.mode !== 'source') return args.mode
  if (args.mode === 'source') {
    return args.sourceLanguage ?? 'source'
  }
  return args.fallback ?? 'source'
}

export function languageName(code: LanguageCode): string {
  if (code === 'pt') return 'Portuguese'
  if (code === 'es') return 'Spanish'
  if (code === 'fr') return 'French'
  if (code === 'de') return 'German'
  if (code === 'it') return 'Italian'
  return 'English'
}

export function buildResponseLanguageInstruction(code: LanguageCode): string {
  return `Write all natural-language output in ${languageName(code)}.`
}

export function buildArtifactLanguageInstruction(mode: ArtifactLanguage): string {
  if (mode === 'source') {
    return 'Write all generated document content in the same language as the source document.'
  }
  return `Write all generated document content in ${languageName(mode)}.`
}
