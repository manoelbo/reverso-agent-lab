/**
 * CLI para reset do filesystem_test.
 *
 * Uso:
 *   pnpm reset:chat
 *   pnpm reset:investigation
 *   pnpm reset:sources-artefacts
 *   pnpm reset:all
 *
 * Ou diretamente com modo como argumento:
 *   node src/scripts/reset-test.ts chat
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetFilesystem, type ResetMode } from '../server/test-reset.js'

const VALID_MODES: ResetMode[] = ['chat', 'investigation', 'sources-artefacts', 'all']

const modeArg = process.argv[2] as ResetMode | undefined

if (!modeArg || !VALID_MODES.includes(modeArg)) {
  console.error(`\n  Uso: reset-test <modo>\n`)
  console.error(`  Modos disponíveis:\n`)
  console.error(`    chat               Limpa histórico de conversa; mantém leads e arquivos gerados`)
  console.error(`    investigation      Remove leads, allegations e findings; mantém sources e dossier`)
  console.error(`    sources-artefacts  Remove artefatos gerados; mantém apenas PDFs`)
  console.error(`    all                Apaga tudo — filesystem_test fica vazio\n`)
  process.exit(1)
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const labRoot = path.resolve(__dirname, '..', '..') // lab/agent/
const filesystemDir = path.join(labRoot, 'filesystem_test')

console.log(`\n  🧪 Reset: ${modeArg}`)
console.log(`  📂 Alvo:  ${filesystemDir}\n`)

const result = await resetFilesystem(modeArg, filesystemDir)

if (result.ok) {
  console.log(`  ✓ ${result.message}\n`)
} else {
  console.error(`  ✗ ${result.message}\n`)
  process.exit(1)
}
