import { generateText } from 'ai'
import type { ZodSchema } from 'zod'
import { resolveLanguageModel } from './model'
import { parseStrictJson } from './contracts'

export interface SelfRepairAttempt {
  attempt: number
  error: string
}

export interface RepairResult<T> {
  ok: boolean
  value?: T
  repairedRaw?: string
  attempts: SelfRepairAttempt[]
}

export async function validateWithSelfRepair<T>(input: {
  raw: string
  schema: ZodSchema<T>
  contractName: string
  maxAttempts?: number
}): Promise<RepairResult<T>> {
  const attempts: SelfRepairAttempt[] = []
  const maxAttempts = input.maxAttempts ?? 2
  let currentRaw = input.raw

  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    try {
      const parsed = parseStrictJson(currentRaw)
      const validated = input.schema.safeParse(parsed)
      if (validated.success) {
        return {
          ok: true,
          value: validated.data,
          repairedRaw: currentRaw,
          attempts,
        }
      }

      attempts.push({
        attempt,
        error: validated.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' | '),
      })
    } catch (error) {
      attempts.push({
        attempt,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    if (attempt >= maxAttempts) break

    const critiquePrompt = [
      'Você é um reparador de JSON contratual.',
      `Contrato: ${input.contractName}`,
      'Retorne SOMENTE JSON válido, sem markdown.',
      'Corrija o payload para atender o schema exigido, sem inventar campos fora de escopo.',
      '',
      'Payload atual:',
      currentRaw,
      '',
      'Erros detectados:',
      attempts.map((item) => `- tentativa ${item.attempt}: ${item.error}`).join('\n'),
    ].join('\n')

    const repaired = await generateText({
      model: resolveLanguageModel(),
      prompt: critiquePrompt,
      temperature: 0,
      maxOutputTokens: 1400,
    })
    currentRaw = repaired.text.trim()
  }

  return {
    ok: false,
    attempts,
  }
}
