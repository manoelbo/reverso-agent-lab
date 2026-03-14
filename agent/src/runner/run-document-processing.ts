import { runDocumentProcessingCommand } from '../tools/document-processing/main.js'

export async function runDocumentProcessing(argv: string[]): Promise<void> {
  await runDocumentProcessingCommand(argv)
}
