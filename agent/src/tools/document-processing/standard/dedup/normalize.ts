/**
 * Utilitarios de normalizacao de strings para deduplicacao fuzzy.
 */

const ADDRESS_ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bav\.?\b/gi, 'avenida'],
  [/\br\.?\b/gi, 'rua'],
  [/\bpca\.?\b/gi, 'praca'],
  [/\bpç\.?\b/gi, 'praca'],
  [/\bpc\.?\b/gi, 'praca'],
  [/\bal\.?\b/gi, 'alameda'],
  [/\btv\.?\b/gi, 'travessa'],
  [/\best\.?\b/gi, 'estrada'],
  [/\brd\.?\b/gi, 'rodovia'],
  [/\bcj\.?\b/gi, 'conjunto'],
  [/\bn[°o°º]\.?\s*/gi, ''],
  [/\bno\.?\s*/gi, ''],
]

/**
 * Normaliza string para comparacao: lowercase, remove acentos, remove pontuacao extra,
 * normaliza espacos.
 */
export function normalizeForComparison(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza enderecos: expande abreviacoes comuns, remove pontuacao redundante,
 * normaliza numeros (remove separadores de milhar).
 */
export function normalizeAddress(addr: string): string {
  let result = addr
  for (const [pattern, replacement] of ADDRESS_ABBREVIATIONS) {
    result = result.replace(pattern, replacement)
  }
  // Remove separadores de milhar em numeros (ex: 2.300 -> 2300)
  result = result.replace(/(\d)\.(\d{3})\b/g, '$1$2')
  return normalizeForComparison(result)
}

/**
 * Normaliza nome de entidade: lowercase, sem acentos, sem pontuacao de sufixo legal
 * (Ltda, ME, SA, Eireli, etc.)
 */
export function normalizeEntityName(name: string): string {
  const legalSuffixes =
    /\s+(ltda?\.?|me\.?|sa\.?|s\.a\.?|eireli\.?|epp\.?|ss\.?|sociedade simples|microempresa|empresa individual)\s*$/i
  return normalizeForComparison(name.replace(legalSuffixes, ''))
}
