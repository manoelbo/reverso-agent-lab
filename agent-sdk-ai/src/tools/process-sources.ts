import { tool } from 'ai'
import { z } from 'zod'
import { detectSystemState } from '@/lib/source-state'
import { resolveConfig } from '@/lib/config'
import { runLegacyCommand } from '@/lib/legacy-cli'
import { compactOutput, requiresApproval } from './helpers'

export const processSourcesTool = tool({
  description:
    'Processa PDFs pendentes da pasta source via pipeline externo doc-process (modo standard).',
  inputSchema: z.object({
    mode: z.enum(['standard']).default('standard'),
    reason: z
      .string()
      .min(1)
      .max(240)
      .optional()
      .describe('Motivo de negócio para processar os documentos agora.'),
  }),
  needsApproval: async (_input, options) => {
    return requiresApproval(options.experimental_context)
  },
  execute: async (input) => {
    const config = resolveConfig()
    const result = await runLegacyCommand([
      'doc-process',
      'process-all',
      '--mode',
      input.mode,
      '--source',
      config.paths.sourceDir,
    ])

    const state = await detectSystemState(config.paths)

    return {
      ok: true,
      processedFiles: state.processedFiles.length,
      pendingFiles: state.unprocessedFiles.length,
      failedFiles: state.failedFiles.length,
      stdout: compactOutput(result.stdout),
      stderr: compactOutput(result.stderr),
      elapsedMs: result.elapsedMs,
    }
  },
})
