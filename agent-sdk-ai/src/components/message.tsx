'use client';

import { isToolUIPart, getToolName } from 'ai';
import type { UIMessage } from 'ai';

interface MessageProps {
  message: UIMessage;
}

export function Message({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {/* Role label */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: isUser ? '#2563eb' : '#059669',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {isUser ? '👤 Você' : '🔍 Reverso'}
      </span>

      {/* Parts */}
      <div
        style={{
          maxWidth: '85%',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {message.parts.map((part, i) => {
          // Text part
          if (part.type === 'text') {
            return (
              <div
                key={`${message.id}-text-${i}`}
                style={{
                  padding: '12px 16px',
                  background: isUser ? '#eff6ff' : '#f0fdf4',
                  border: `1px solid ${isUser ? '#bfdbfe' : '#bbf7d0'}`,
                  borderRadius: 12,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(part.text),
                }}
              />
            );
          }

          // Tool parts — generic handler using isToolUIPart
          if (isToolUIPart(part)) {
            const name = getToolName(part);
            return (
              <ToolPartDisplay
                key={`${message.id}-tool-${i}`}
                toolName={name}
                state={part.state}
                input={'input' in part ? (part.input as unknown) : undefined}
                output={'output' in part ? (part.output as unknown) : undefined}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

// ─── Tool Part Display ──────────────────────────────────────────────────────

function ToolPartDisplay({
  toolName,
  state,
  input,
  output,
}: {
  toolName: string;
  state: string;
  input?: unknown;
  output?: unknown;
}) {
  const toolLabels: Record<string, { icon: string; label: string }> = {
    checkSystemState: { icon: '📊', label: 'Verificando estado do sistema' },
    processDocuments: { icon: '⚙️', label: 'Processando documentos' },
    initContext: { icon: '📝', label: 'Inicializando contexto' },
    readFilesystem: { icon: '📁', label: 'Lendo dados do filesystem' },
    deepDive: { icon: '🔬', label: 'Deep Dive — Análise profunda' },
    createLead: { icon: '🎯', label: 'Criando lead de investigação' },
    runInquiry: { icon: '🔍', label: 'Executando inquiry' },
    deepDiveNext: { icon: '➡️', label: 'Continuando sessão deep-dive' },
    updateAgentContext: { icon: '✏️', label: 'Atualizando contexto' },
    quickResearch: { icon: '🔎', label: 'Pesquisa rápida' },
  };

  const info = toolLabels[toolName] ?? { icon: '🔧', label: toolName };
  const isLoading = state === 'input-streaming' || state === 'input-available';
  const isDone = state === 'output-available';

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {/* Tool header */}
      <div
        style={{
          padding: '10px 16px',
          background: isLoading ? '#fefce8' : isDone ? '#f0fdf4' : '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <span>{info.icon}</span>
        <span>{info.label}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 12,
            background: isLoading ? '#fef08a' : isDone ? '#bbf7d0' : '#e5e7eb',
            color: isLoading ? '#a16207' : isDone ? '#166534' : '#6b7280',
          }}
        >
          {isLoading ? 'executando...' : isDone ? 'concluído' : state}
        </span>
      </div>

      {/* Tool output */}
      {isDone && output != null && (
        <div style={{ padding: '12px 16px' }}>
          <ToolOutputRenderer toolName={toolName} output={output} />
        </div>
      )}
    </div>
  );
}

// ─── Tool-specific output renderers ─────────────────────────────────────────

function ToolOutputRenderer({
  toolName,
  output,
}: {
  toolName: string;
  output: unknown;
}) {
  const data = output as Record<string, unknown>;

  // Check for errors
  if (data.ok === false && data.error) {
    return (
      <div style={{ color: '#dc2626', fontSize: 13 }}>
        {'⚠️ ' + String(data.error)}
      </div>
    );
  }

  switch (toolName) {
    case 'checkSystemState':
      return <SystemStateOutput data={data} />;
    case 'initContext':
      return <InitContextOutput data={data} />;
    case 'deepDive':
      return <DeepDiveOutput data={data} />;
    case 'createLead':
      return <CreateLeadOutput data={data} />;
    case 'runInquiry':
      return <InquiryOutput data={data} />;
    case 'readFilesystem':
      return <FilesystemOutput data={data} />;
    default:
      return (
        <pre
          style={{
            fontSize: 12,
            maxHeight: 200,
            overflow: 'auto',
            background: '#f9fafb',
            padding: 8,
            borderRadius: 6,
          }}
        >
          {JSON.stringify(output, null, 2)}
        </pre>
      );
  }
}

function SystemStateOutput({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div>{'📄 Fontes: ' + String(data.totalSourceFiles ?? 0) + ' total'}</div>
      <div>{'✅ Processados: ' + String(data.processedCount ?? 0)}</div>
      <div>{'⏳ Pendentes: ' + String(data.unprocessedCount ?? 0)}</div>
      <div>{'📋 Agent.md: ' + (data.hasAgentContext ? '✅ existe' : '❌ não existe')}</div>
      <div>{'🎯 Leads: ' + String(data.leadsCount ?? 0)}</div>
    </div>
  );
}

function InitContextOutput({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>
        {(data.isReInit ? '🔄 Contexto atualizado' : '✅ Contexto criado') +
          ' — ' +
          String(data.previewsUsed) +
          ' previews analisados'}
      </div>
      {typeof data.agentMdContent === 'string' && (
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: 4 }}>
            Ver agent.md
          </summary>
          <pre
            style={{
              fontSize: 12,
              maxHeight: 300,
              overflow: 'auto',
              background: '#f9fafb',
              padding: 8,
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
            }}
          >
            {String(data.agentMdContent)}
          </pre>
        </details>
      )}
    </div>
  );
}

function DeepDiveOutput({ data }: { data: Record<string, unknown> }) {
  const leads = (data.suggestedLeads ?? []) as Array<{
    slug: string;
    title: string;
    description: string;
    isNew: boolean;
  }>;
  const conclusions = data.conclusions as { summary?: string } | undefined;

  return (
    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>{'📊 ' + String(data.previewsAnalyzed) + ' previews analisados'}</div>

      {conclusions?.summary && (
        <div>
          <strong>Resumo:</strong> {conclusions.summary}
        </div>
      )}

      {leads.length > 0 && (
        <div>
          <strong>Leads sugeridos:</strong>
          {leads.map((lead, i) => (
            <div
              key={lead.slug}
              style={{
                padding: '8px 12px',
                marginTop: 4,
                background: '#f9fafb',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
            >
              <div style={{ fontWeight: 500 }}>
                {i + 1 + '. ' + lead.title}
                {lead.isNew ? (
                  <span style={{ fontSize: 11, color: '#059669', marginLeft: 8 }}>
                    NOVO
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
                    já existia
                  </span>
                )}
              </div>
              <div style={{ color: '#6b7280', marginTop: 2 }}>{lead.description}</div>
            </div>
          ))}
        </div>
      )}

      {typeof data.recommendation === 'string' && (
        <div>
          <strong>Recomendação:</strong> {data.recommendation}
        </div>
      )}
    </div>
  );
}

function CreateLeadOutput({ data }: { data: Record<string, unknown> }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>
        {'🎯 Lead criado: ' + String(data.title)}
      </div>
      <div style={{ color: '#6b7280' }}>{String(data.description)}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
        {'Slug: ' + String(data.slug) + ' • Caminho: ' + String(data.leadPath)}
      </div>
    </div>
  );
}

function InquiryOutput({ data }: { data: Record<string, unknown> }) {
  const allegations = (data.allegations ?? []) as Array<{
    id: string;
    statement: string;
  }>;
  const findings = (data.findings ?? []) as Array<{
    id: string;
    claim: string;
    status: string;
    evidenceCount: number;
  }>;

  const scenarioColor =
    data.scenario === 'positive'
      ? { bg: '#dcfce7', fg: '#166534' }
      : data.scenario === 'negative'
        ? { bg: '#fee2e2', fg: '#991b1b' }
        : { bg: '#fef3c7', fg: '#92400e' };

  return (
    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <strong>Cenário: </strong>
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 12,
            fontSize: 11,
            background: scenarioColor.bg,
            color: scenarioColor.fg,
          }}
        >
          {String(data.scenario)}
        </span>
        {' • Confiança: ' + String(((data.confidence as number) * 100).toFixed(0)) + '%'}
      </div>

      <div>{String(data.conclusion)}</div>

      {allegations.length > 0 && (
        <div>
          <strong>{'Alegações (' + allegations.length + '):'}</strong>
          {allegations.map((a) => (
            <div key={a.id} style={{ padding: '4px 0', paddingLeft: 16 }}>
              {'• ' + a.statement}
            </div>
          ))}
        </div>
      )}

      {findings.length > 0 && (
        <div>
          <strong>{'Findings (' + findings.length + '):'}</strong>
          {findings.map((f) => (
            <div key={f.id} style={{ padding: '4px 0', paddingLeft: 16 }}>
              {'• [' + f.status + '] ' + f.claim + ' (' + f.evidenceCount + ' evidência(s))'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilesystemOutput({ data }: { data: Record<string, unknown> }) {
  if (data.content) {
    return (
      <pre
        style={{
          fontSize: 12,
          maxHeight: 300,
          overflow: 'auto',
          background: '#f9fafb',
          padding: 8,
          borderRadius: 6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {String(data.content)}
      </pre>
    );
  }

  if (data.leads) {
    const leads = data.leads as Array<{
      slug: string;
      title: string;
      status: string;
    }>;
    return (
      <div style={{ fontSize: 13 }}>
        <div style={{ marginBottom: 4 }}>{String(data.count) + ' lead(s):'}</div>
        {leads.map((l) => (
          <div key={l.slug} style={{ padding: '2px 0' }}>
            {'• '}
            <strong>{l.title}</strong>
            {' (' + l.slug + ') [' + l.status + ']'}
          </div>
        ))}
      </div>
    );
  }

  if (data.items) {
    const items = data.items as Array<string | { name: string }>;
    return (
      <div style={{ fontSize: 13 }}>
        <div style={{ marginBottom: 4 }}>{String(data.count) + ' item(s):'}</div>
        {items.slice(0, 20).map((item, i) => (
          <div key={i} style={{ padding: '2px 0' }}>
            {'• ' + (typeof item === 'string' ? item : item.name)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre
      style={{
        fontSize: 12,
        maxHeight: 200,
        overflow: 'auto',
        background: '#f9fafb',
        padding: 8,
        borderRadius: 6,
      }}
    >
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ─── Simple Markdown renderer ───────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h4 style="margin:8px 0 4px;font-size:14px">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 4px;font-size:15px">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:16px 0 4px;font-size:16px">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`(.+?)`/g,
      '<code style="background:#f3f4f6;padding:2px 4px;border-radius:3px;font-size:12px">$1</code>',
    )
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px">• $1</div>')
    .replace(/^\d+\. (.+)$/gm, '<div style="padding-left:16px">$&</div>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}
