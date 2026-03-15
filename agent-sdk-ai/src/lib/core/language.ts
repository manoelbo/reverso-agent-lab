export type LanguageCode = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it';

export function buildResponseLanguageInstruction(language: LanguageCode): string {
  const labels: Record<LanguageCode, string> = {
    en: 'English',
    pt: 'Portuguese (Brazilian)',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
  };
  const label = labels[language] ?? 'English';
  return `IMPORTANT: Write your response in ${label}. All text output, titles, descriptions, and conclusions must be in ${label}.`;
}

export function detectLanguageFromText(text: string): LanguageCode {
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Simple heuristic based on common words
  const ptWords = ['voce', 'quero', 'investigar', 'sobre', 'pode', 'fazer', 'fontes', 'documentos', 'ola', 'tudo', 'bem'];
  const esWords = ['quiero', 'investigar', 'sobre', 'puede', 'hacer', 'fuentes', 'documentos', 'hola'];

  const ptCount = ptWords.filter((w) => lower.includes(w)).length;
  const esCount = esWords.filter((w) => lower.includes(w)).length;

  if (ptCount >= 2) return 'pt';
  if (esCount >= 2) return 'es';
  return 'en';
}
