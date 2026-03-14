/**
 * Implementacao de similaridade fuzzy baseada em Levenshtein distance.
 * Sem dependencias externas.
 */

/**
 * Calcula a distancia de Levenshtein entre duas strings.
 * Implementacao in-place com array de linha unica (O(min(a,b)) de espaco).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Garante que 'a' seja a string menor (otimizacao de espaco)
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  const aLen = a.length
  const bLen = b.length
  const row: number[] = Array.from({ length: aLen + 1 }, (_, i) => i)

  for (let j = 1; j <= bLen; j += 1) {
    let prev = j
    for (let i = 1; i <= aLen; i += 1) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[i - 1]!
          : 1 + Math.min(row[i - 1]!, row[i]!, prev)
      row[i - 1] = prev
      prev = val
    }
    row[aLen] = prev
  }

  return row[aLen]!
}

/**
 * Calcula score de similaridade entre 0 e 1.
 * 1.0 = identico, 0.0 = completamente diferente.
 */
export function similarityScore(a: string, b: string): number {
  if (a === b) return 1
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshteinDistance(a, b) / maxLen
}

/**
 * Retorna true se a similaridade entre as strings for >= threshold.
 * Default threshold: 0.85 (85% de similaridade).
 */
export function isFuzzyMatch(a: string, b: string, threshold = 0.85): boolean {
  return similarityScore(a, b) >= threshold
}

/**
 * Encontra o melhor match em uma lista de strings candidatas.
 * Retorna o match com maior score se >= threshold, null caso contrario.
 */
export function bestMatch(
  query: string,
  candidates: string[],
  threshold = 0.85
): { value: string; score: number } | null {
  let best: { value: string; score: number } | null = null
  for (const candidate of candidates) {
    const score = similarityScore(query, candidate)
    if (score >= threshold && (best === null || score > best.score)) {
      best = { value: candidate, score }
    }
  }
  return best
}
