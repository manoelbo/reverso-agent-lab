export function formatFrontmatter(data: Record<string, string | number | boolean | string[]>): string {
  const lines = Object.entries(data).flatMap(([key, value]) => {
    if (Array.isArray(value)) {
      return [`${key}:`, ...value.map((item) => `  - ${escapeYaml(item)}`)]
    }
    return `${key}: ${escapeYaml(String(value))}`
  })
  return ['---', ...lines, '---'].join('\n')
}

function escapeYaml(value: string): string {
  if (value.length === 0) return '""'
  if (/^[a-zA-Z0-9._/-]+$/.test(value)) return value
  return `"${value.replace(/"/g, '\\"')}"`
}

export function buildSourceTrace(source: string, page?: number): string {
  const pageSuffix = page ? `#p${page}` : ''
  return `→[source:${source}${pageSuffix}]`
}

export function extractCandidateEntities(text: string, max = 12): string[] {
  const matches = text.match(/\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç]+){1,3}\b/g) ?? []
  const unique = [...new Set(matches.map((item) => item.trim()))]
  return unique.slice(0, max)
}

export function stripCodeFence(content: string): string {
  return content
    .replace(/^```(?:json|markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/**
 * Extrai o primeiro array/objeto JSON valido de uma string que pode conter
 * texto extra, code fences, ou outros artefatos do LLM.
 * Tambem sanitiza caracteres de controle (newlines literais) dentro de strings JSON,
 * que LLMs frequentemente inserem tornando o JSON invalido.
 */
export function extractJsonArray(content: string): string {
  const stripped = stripCodeFence(content)

  // Encontra inicio do array ou objeto
  const arrayStart = stripped.indexOf('[')
  const objectStart = stripped.indexOf('{')

  let start = -1
  let openChar: string
  let closeChar: string

  if (arrayStart === -1 && objectStart === -1) return stripped.trim()

  if (arrayStart === -1) {
    start = objectStart
    openChar = '{'
    closeChar = '}'
  } else if (objectStart === -1) {
    start = arrayStart
    openChar = '['
    closeChar = ']'
  } else {
    start = Math.min(arrayStart, objectStart)
    openChar = stripped[start] === '[' ? '[' : '{'
    closeChar = openChar === '[' ? ']' : '}'
  }

  // Encontra o fechamento correto via bracket counting e sanitiza simultaneamente
  let depth = 0
  let inString = false
  let escape = false
  let end = -1

  for (let i = start; i < stripped.length; i += 1) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth += 1
    else if (ch === closeChar) {
      depth -= 1
      if (depth === 0) { end = i; break }
    }
  }

  const raw = end !== -1 ? stripped.slice(start, end + 1) : stripped.slice(start)
  return sanitizeJsonControlChars(raw)
}

/**
 * Repara um array JSON truncado (resposta cortada pelo limite de tokens do LLM).
 * Remove o ultimo objeto incompleto e fecha o array corretamente.
 * Retorna o JSON reparado como string.
 */
export function repairTruncatedJsonArray(jsonStr: string): string {
  // Encontra a posicao do ultimo objeto COMPLETO (depth 0 apos fechar um {})
  let depth = 0
  let inString = false
  let escape = false
  let lastCompleteObjectEnd = -1

  for (let i = 0; i < jsonStr.length; i += 1) {
    const ch = jsonStr[i]
    const code = jsonStr.charCodeAt(i)

    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    // Ignora caracteres de controle fora de strings
    if (code < 0x20) continue

    if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 1 && ch === '}') {
        // Fechou um objeto no nivel 1 (dentro do array raiz)
        lastCompleteObjectEnd = i
      }
    }
  }

  if (lastCompleteObjectEnd === -1) return '[]'

  // Pega tudo ate o ultimo objeto completo + fecha o array
  const repaired = jsonStr.slice(0, lastCompleteObjectEnd + 1).trimEnd()
  // Remove trailing comma se houver
  const withoutTrailingComma = repaired.endsWith(',') ? repaired.slice(0, -1) : repaired
  return withoutTrailingComma + '\n]'
}

/**
 * Substitui caracteres de controle literais (newlines, tabs, carriage returns)
 * dentro de strings JSON pelos seus equivalentes escaped.
 * Necessario porque LLMs frequentemente inserem newlines literais em strings JSON.
 */
function sanitizeJsonControlChars(jsonStr: string): string {
  let result = ''
  let inString = false
  let escape = false

  for (let i = 0; i < jsonStr.length; i += 1) {
    const ch = jsonStr[i]
    const code = jsonStr.charCodeAt(i)

    if (escape) {
      escape = false
      result += ch
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      result += ch
      continue
    }

    if (ch === '"') {
      inString = !inString
      result += ch
      continue
    }

    if (inString) {
      // Substitui caracteres de controle por suas versoes escaped
      if (code === 0x0a) { result += '\\n'; continue }   // LF
      if (code === 0x0d) { result += '\\r'; continue }   // CR
      if (code === 0x09) { result += '\\t'; continue }   // TAB
      if (code < 0x20) { result += `\\u${code.toString(16).padStart(4, '0')}`; continue }
    }

    result += ch
  }

  return result
}

