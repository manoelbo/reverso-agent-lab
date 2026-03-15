import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { initContextTool } from '../src/tools/init-context'
import { processSourcesTool } from '../src/tools/process-sources'
import { runInquiryTool } from '../src/tools/run-inquiry'
import { updateAgentContextTool } from '../src/tools/update-agent-context'

async function withFilesystemEnv<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const previousFilesystem = process.env['REVERSO_FILESYSTEM_ROOT']
  const previousLegacyRoot = process.env['REVERSO_LEGACY_ROOT']
  const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-approval-'))
  const legacy = await mkdtemp(path.join(os.tmpdir(), 'reverso-approval-legacy-'))
  await mkdir(path.join(root, 'source'), { recursive: true })

  process.env['REVERSO_FILESYSTEM_ROOT'] = root
  process.env['REVERSO_LEGACY_ROOT'] = legacy

  try {
    return await fn(root)
  } finally {
    if (previousFilesystem === undefined) {
      delete process.env['REVERSO_FILESYSTEM_ROOT']
    } else {
      process.env['REVERSO_FILESYSTEM_ROOT'] = previousFilesystem
    }

    if (previousLegacyRoot === undefined) {
      delete process.env['REVERSO_LEGACY_ROOT']
    } else {
      process.env['REVERSO_LEGACY_ROOT'] = previousLegacyRoot
    }
  }
}

describe('tool approval policies', () => {
  it('initContext não exige aprovação quando agent.md ainda não existe', async () => {
    await withFilesystemEnv(async () => {
      const needsApproval = (initContextTool as unknown as {
        needsApproval: (input: { force: boolean }, options: { experimental_context: unknown }) => Promise<boolean>
      }).needsApproval

      const result = await needsApproval(
        { force: false },
        { experimental_context: { autoAccept: false } }
      )
      assert.equal(result, false)
    })
  })

  it('initContext respeita autoAccept quando agent.md já existe', async () => {
    await withFilesystemEnv(async (root) => {
      await writeFile(path.join(root, 'agent.md'), '# contexto', 'utf8')
      const needsApproval = (initContextTool as unknown as {
        needsApproval: (input: { force: boolean }, options: { experimental_context: unknown }) => Promise<boolean>
      }).needsApproval

      const manual = await needsApproval(
        { force: true },
        { experimental_context: { autoAccept: false } }
      )
      const automatic = await needsApproval(
        { force: true },
        { experimental_context: { autoAccept: true } }
      )

      assert.equal(manual, true)
      assert.equal(automatic, false)
    })
  })

  it('processSources/updateAgentContext/runInquiry exigem aprovação por padrão', async () => {
    const processNeedsApproval = (processSourcesTool as unknown as {
      needsApproval: (input: unknown, options: { experimental_context: unknown }) => Promise<boolean>
    }).needsApproval
    const updateNeedsApproval = (updateAgentContextTool as unknown as {
      needsApproval: (input: unknown, options: { experimental_context: unknown }) => Promise<boolean>
    }).needsApproval
    const inquiryNeedsApproval = (runInquiryTool as unknown as {
      needsApproval: (input: unknown, options: { experimental_context: unknown }) => Promise<boolean>
    }).needsApproval

    const [processManual, processAuto] = await Promise.all([
      processNeedsApproval({}, { experimental_context: { autoAccept: false } }),
      processNeedsApproval({}, { experimental_context: { autoAccept: true } }),
    ])
    const [updateManual, updateAuto] = await Promise.all([
      updateNeedsApproval({}, { experimental_context: { autoAccept: false } }),
      updateNeedsApproval({}, { experimental_context: { autoAccept: true } }),
    ])
    const [inquiryManual, inquiryAuto] = await Promise.all([
      inquiryNeedsApproval({}, { experimental_context: { autoAccept: false } }),
      inquiryNeedsApproval({}, { experimental_context: { autoAccept: true } }),
    ])

    assert.equal(processManual, true)
    assert.equal(processAuto, false)
    assert.equal(updateManual, true)
    assert.equal(updateAuto, false)
    assert.equal(inquiryManual, true)
    assert.equal(inquiryAuto, false)
  })
})
