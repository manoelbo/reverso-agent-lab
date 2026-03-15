import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile } from 'node:fs/promises'
import { POST } from '../src/app/api/upload/route'

describe('/api/upload route', () => {
  it('aceita PDF e rejeita duplicado', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-upload-'))
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = root
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot

    const formData = new FormData()
    formData.append('files', new File([Buffer.from('pdf-content')], 'doc-a.pdf', { type: 'application/pdf' }))

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    })
    const firstResponse = await POST(request)
    const firstPayload = (await firstResponse.json()) as {
      accepted: string[]
      rejected: Array<{ fileName: string; reason: string }>
    }

    assert.deepEqual(firstPayload.accepted, ['doc-a.pdf'])
    assert.equal(firstPayload.rejected.length, 0)

    const saved = await readFile(path.join(root, 'source', 'doc-a.pdf'), 'utf8')
    assert.equal(saved, 'pdf-content')

    const secondForm = new FormData()
    secondForm.append('files', new File([Buffer.from('pdf-content')], 'doc-a.pdf', { type: 'application/pdf' }))
    const secondRequest = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: secondForm,
    })
    const secondResponse = await POST(secondRequest)
    const secondPayload = (await secondResponse.json()) as {
      accepted: string[]
      rejected: Array<{ fileName: string; reason: string }>
    }

    assert.equal(secondPayload.accepted.length, 0)
    assert.equal(secondPayload.rejected[0]?.fileName, 'doc-a.pdf')
  })

  it('rejeita arquivo não-PDF', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'reverso-upload-'))
    const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'reverso-legacy-'))
    process.env['REVERSO_FILESYSTEM_ROOT'] = root
    process.env['REVERSO_LEGACY_ROOT'] = legacyRoot

    const formData = new FormData()
    formData.append(
      'files',
      new File([Buffer.from('csv-content')], 'dados.csv', { type: 'text/csv' })
    )

    const request = new Request('http://localhost/api/upload', {
      method: 'POST',
      body: formData,
    })
    const response = await POST(request)
    const payload = (await response.json()) as {
      accepted: string[]
      rejected: Array<{ fileName: string; reason: string }>
    }

    assert.equal(payload.accepted.length, 0)
    assert.equal(payload.rejected[0]?.fileName, 'dados.csv')
    assert.ok((payload.rejected[0]?.reason ?? '').includes('apenas PDF'))
  })
})
