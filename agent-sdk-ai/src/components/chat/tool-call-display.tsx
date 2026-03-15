interface ToolCallDisplayProps {
  toolName: string
  stateLabel: string
  input: unknown
  output?: unknown
  errorText?: string
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function ToolCallDisplay({
  toolName,
  stateLabel,
  input,
  output,
  errorText,
}: ToolCallDisplayProps) {
  return (
    <div
      style={{
        background: '#11141a',
        border: '1px solid #2a3140',
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 8,
      }}
    >
      <div>
        <strong>Tool:</strong> {toolName}{' '}
        <span style={{ color: 'var(--muted)' }}>({stateLabel})</span>
      </div>

      <details>
        <summary>Input</summary>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{json(input)}</pre>
      </details>

      {output !== undefined ? (
        <details open>
          <summary>Output</summary>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{json(output)}</pre>
        </details>
      ) : null}

      {errorText ? <div style={{ color: 'var(--danger)' }}>Erro: {errorText}</div> : null}
    </div>
  )
}
