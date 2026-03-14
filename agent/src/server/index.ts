import http from 'node:http'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import busboy from 'busboy'
import { handleChat } from './routes/chat.js'
import { resolveApproval } from './approval-gate.js'
import { appendChatTurn, loadChatSession, DEFAULT_SESSION_ID } from './chat-session.js'
import { loadRoutingContext } from './routing-context.js'
import { resetFilesystem, isValidResetMode } from './test-reset.js'
import { cancelRequest, registerRequest, unregisterRequest } from './request-registry.js'
import { scanSourceFiles, toSourceFileEntries } from '../tools/document-processing/source-indexer.js'
import { loadSourceCheckpoint, upsertSourceFileEntries } from '../tools/document-processing/source-checkpoint.js'
import { loadActiveSession } from '../core/deep-dive-session-store.js'
import { startSseStream, emit } from './sse-emitter.js'
import { SseUiFeedback } from '../feedback/sse-ui-feedback.js'
import { runDocumentProcessingWithFeedback } from '../runner/run-document-processing-ui.js'

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

const PORT = Number(process.env.AGENT_PORT ?? 3210)
const ALLOWED_ORIGIN = process.env.AGENT_CORS_ORIGIN ?? 'http://localhost:5173'
const TEST_MODE = process.env['AGENT_TEST_MODE'] === 'true'

function addCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

const server = http.createServer((req, res) => {
  addCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString(), testMode: TEST_MODE }))
    return
  }

  if (req.method === 'GET' && req.url === '/api/context') {
    loadRoutingContext()
      .then((ctx) => {
        const s = ctx.systemState
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          model: ctx.runtime.model,
          sessionStage: ctx.session?.stage ?? null,
          leadsCount: ctx.leads.length,
          sourceEmpty: s.sourceEmpty,
          unprocessedCount: s.unprocessedFiles.length,
          processedCount: s.processedFiles.length,
          failedCount: s.failedFiles.length,
          hasAgentContext: s.hasAgentContext,
          isFirstVisit: s.isFirstVisit,
          hasPreviewsWithoutInit: s.hasPreviewsWithoutInit,
          lastSessionTimestamp: s.lastSessionTimestamp ?? null,
          testMode: TEST_MODE,
        }))
      })
      .catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to load context' }))
      })
    return
  }

  if (req.method === 'GET' && req.url === '/api/session') {
    loadChatSession(DEFAULT_SESSION_ID)
      .then((session) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: session.id, messages: session.messages }))
      })
      .catch(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: DEFAULT_SESSION_ID, messages: [] }))
      })
    return
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    handleChat(req, res).catch((err: unknown) => {
      console.error('[agent-server] /api/chat error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
      }
    })
    return
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/approval/')) {
    const requestId = req.url.split('/api/approval/')[1] ?? ''
    readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const approved = body['approved'] === true
        const found = resolveApproval(requestId, approved)
        res.writeHead(found ? 200 : 404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: found }))
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid request' }))
      })
    return
  }

  if (req.method === 'POST' && req.url === '/api/cancel') {
    readBody(req)
      .then((raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const requestId = body['requestId']
        if (typeof requestId !== 'string' || !requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'requestId is required' }))
          return
        }
        const found = cancelRequest(requestId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: found }))
      })
      .catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid request' }))
      })
    return
  }

  if (req.method === 'POST' && req.url === '/api/test/reset') {
    if (!TEST_MODE) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Test reset only available in test mode (AGENT_TEST_MODE=true)' }))
      return
    }
    readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const mode = body['mode']
        if (!isValidResetMode(mode)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Invalid reset mode: ${String(mode)}. Use: chat | investigation | sources-artefacts | all` }))
          return
        }
        const ctx = await loadRoutingContext()
        const result = await resetFilesystem(mode, ctx.runtime.paths.filesystemDir)
        res.writeHead(result.ok ? 200 : 500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    return
  }

  if (req.method === 'POST' && req.url === '/api/process-documents') {
    readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const fileIds = Array.isArray(body['fileIds']) ? body['fileIds'] as string[] : undefined

        const requestId = randomUUID()
        const controller = registerRequest(requestId)
        const signal = controller.signal

        startSseStream(res)
        emit(res, 'status', { phase: 'processing', label: 'Processando documentos...', requestId })

        const feedback = new SseUiFeedback(res)
        const ctx = await loadRoutingContext()

        try {
          await runDocumentProcessingWithFeedback(feedback, ctx.runtime, signal, fileIds)
        } catch (err) {
          if (!signal.aborted) {
            const message = err instanceof Error ? err.message : String(err)
            emit(res, 'error', { message })
          }
        }

        const fullText = feedback.getFullText()
        emit(res, 'text-done', { fullText })
        emit(res, 'status', { phase: 'idle', label: '' })
        emit(res, 'done', { messageId: requestId })

        unregisterRequest(requestId)

        // Persist turn
        const sessionId = DEFAULT_SESSION_ID
        const now = new Date().toISOString()
        await appendChatTurn(
          sessionId,
          { id: randomUUID(), role: 'user', text: '[Processamento de documentos]', timestamp: now },
          { id: requestId, role: 'assistant', text: fullText, timestamp: now },
        ).catch(() => { /* non-fatal */ })

        if (!res.writableEnded) res.end()
      })
      .catch((err: unknown) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }))
        }
      })
    return
  }

  if (req.method === 'POST' && req.url === '/api/upload') {
    const contentType = req.headers['content-type'] ?? ''
    if (!contentType.includes('multipart/form-data')) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Expected multipart/form-data' }))
      return
    }

    loadRoutingContext()
      .then(async (ctx) => {
        const sourceDir = ctx.runtime.paths.sourceDir
        await mkdir(sourceDir, { recursive: true })

        // Load existing files to detect duplicates
        const existing = await scanSourceFiles(sourceDir)
        const existingNames = new Set(existing.map((f) => f.originalFileName))

        const accepted: string[] = []
        const rejected: string[] = []
        const reasons: Record<string, string> = {}

        await new Promise<void>((resolve, reject) => {
          const bb = busboy({ headers: req.headers })

          bb.on('file', (fieldname, fileStream, info) => {
            const { filename, mimeType } = info
            const cleanName = path.basename(filename)

            // Reject non-PDFs
            if (mimeType !== 'application/pdf' && !cleanName.toLowerCase().endsWith('.pdf')) {
              rejected.push(cleanName)
              reasons[cleanName] = 'Apenas arquivos PDF são aceitos'
              fileStream.resume()
              return
            }

            // Reject duplicates
            if (existingNames.has(cleanName)) {
              rejected.push(cleanName)
              reasons[cleanName] = 'Arquivo já existe em source'
              fileStream.resume()
              return
            }

            const destPath = path.join(sourceDir, cleanName)
            const writeStream = createWriteStream(destPath)

            fileStream.pipe(writeStream)
            writeStream.on('finish', () => {
              accepted.push(cleanName)
              existingNames.add(cleanName)
            })
            writeStream.on('error', (err) => {
              rejected.push(cleanName)
              reasons[cleanName] = `Erro ao salvar: ${err.message}`
            })
          })

          bb.on('finish', resolve)
          bb.on('error', reject)
          req.pipe(bb)
        })

        // Add new entries to checkpoint as not_processed
        if (accepted.length > 0) {
          // Re-scan to get proper docIds and artifactDirs from source-indexer
          const freshScan = await scanSourceFiles(sourceDir)
          const checkpoint = await loadSourceCheckpoint(sourceDir)
          const existingByDocId = new Map((checkpoint?.files ?? []).map((f) => [f.docId, f]))

          const newScanned = freshScan.filter((f) => accepted.includes(f.originalFileName))
          const entries = toSourceFileEntries(newScanned, existingByDocId)
          // Only insert truly new ones (not already in checkpoint)
          const onlyNew = entries.filter((e) => !existingByDocId.has(e.docId))

          if (onlyNew.length > 0) {
            await upsertSourceFileEntries(sourceDir, onlyNew)
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ accepted, rejected, reasons }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    return
  }

  // POST /api/leads/:slug/action — accept or reject a lead
  const leadsActionMatch = req.method === 'POST' && req.url?.match(/^\/api\/leads\/([^/]+)\/action$/)
  if (leadsActionMatch) {
    const slug = leadsActionMatch[1]!
    readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const action = body['action']
        if (action !== 'accept' && action !== 'reject') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'action must be "accept" or "reject"' }))
          return
        }

        const ctx = await loadRoutingContext()
        const leadFile = path.join(ctx.runtime.paths.leadsDir, `lead-${slug}.md`)

        let content: string
        try {
          content = await readFile(leadFile, 'utf-8')
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Lead "${slug}" not found` }))
          return
        }

        const newStatus = action === 'accept' ? 'planned' : 'rejected'
        const updated = content.replace(
          /^status:\s*.+$/m,
          `status: ${newStatus}`
        )
        await writeFile(leadFile, updated, 'utf-8')

        // Check if all session leads are now rejected (for post-rejection suggestions)
        let allRejected = false
        const suggestions: Array<{ id: string; text: string }> = []

        if (action === 'reject') {
          try {
            const activeSession = await loadActiveSession(ctx.runtime.paths)
            if (activeSession && activeSession.suggestedLeads.length > 0) {
              let allDone = true
              for (const lead of activeSession.suggestedLeads) {
                const lf = path.join(ctx.runtime.paths.leadsDir, `lead-${lead.slug}.md`)
                try {
                  const lc = await readFile(lf, 'utf-8')
                  const statusMatch = lc.match(/^status:\s*(.+)$/m)
                  const status = statusMatch?.[1]?.trim() ?? 'draft'
                  if (status !== 'rejected') {
                    allDone = false
                    break
                  }
                } catch {
                  allDone = false
                  break
                }
              }
              allRejected = allDone
              if (allRejected) {
                suggestions.push(
                  { id: 'new-deep-dive', text: 'Fazer novo deep-dive com outras perspectivas' },
                  { id: 'create-lead', text: 'Criar lead com minha própria hipótese' },
                  { id: 'view-sources', text: 'Ver fontes disponíveis' },
                )
              }
            }
          } catch {
            // Non-fatal — ignore session check errors
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ok: true,
          message: `Lead "${slug}" marked as ${newStatus}`,
          allRejected,
          ...(suggestions.length > 0 ? { suggestions } : {}),
        }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    return
  }

  // POST /api/allegations/:id/action — accept or reject an allegation
  const allegationsActionMatch = req.method === 'POST' && req.url?.match(/^\/api\/allegations\/([^/]+)\/action$/)
  if (allegationsActionMatch) {
    const id = allegationsActionMatch[1]!
    readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const action = body['action']
        const leadSlug = body['leadSlug']
        if ((action !== 'accept' && action !== 'reject') || typeof leadSlug !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'action must be "accept" or "reject" and leadSlug is required' }))
          return
        }

        const ctx = await loadRoutingContext()
        const allegationFile = path.join(ctx.runtime.paths.allegationsDir, `${id}.md`)

        let content: string
        try {
          content = await readFile(allegationFile, 'utf-8')
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Allegation "${id}" not found` }))
          return
        }

        const newStatus = action === 'accept' ? 'accepted' : 'rejected'
        const updated = content.includes('review_status:')
          ? content.replace(/^review_status:\s*.+$/m, `review_status: ${newStatus}`)
          : content.replace(/^(---\n)/, `$1review_status: ${newStatus}\n`)

        await writeFile(allegationFile, updated, 'utf-8')

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, message: `Allegation "${id}" marked as ${newStatus}` }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    return
  }

  // POST /api/findings/:id/action — verify or reject a finding
  const findingsActionMatch = req.method === 'POST' && req.url?.match(/^\/api\/findings\/([^/]+)\/action$/)
  if (findingsActionMatch) {
    const id = findingsActionMatch[1]!
    readBody(req)
      .then(async (raw) => {
        const body = JSON.parse(raw) as Record<string, unknown>
        const action = body['action']
        if (action !== 'verify' && action !== 'reject') {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'action must be "verify" or "reject"' }))
          return
        }

        const ctx = await loadRoutingContext()
        const findingFile = path.join(ctx.runtime.paths.findingsDir, `${id}.md`)

        let content: string
        try {
          content = await readFile(findingFile, 'utf-8')
        } catch {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Finding "${id}" not found` }))
          return
        }

        const newStatus = action === 'verify' ? 'verified' : 'rejected'
        const updated = content.replace(/^status:\s*.+$/m, `status: ${newStatus}`)

        await writeFile(findingFile, updated, 'utf-8')

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, message: `Finding "${id}" marked as ${newStatus}` }))
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  const modeLabel = TEST_MODE ? ' [TEST MODE — filesystem_test]' : ''
  console.log(`[agent-server] listening on http://localhost:${PORT}${modeLabel}`)
})
