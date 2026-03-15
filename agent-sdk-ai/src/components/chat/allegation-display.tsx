interface AllegationDisplayProps {
  lead: string
  verifiedFindings: number
  reviewQueue: number
  allegations?: Array<{ id: string; statement: string }>
  verifiedItems?: Array<{ id: string; claim: string }>
  reviewItems?: Array<{ id: string; claim: string }>
  onAcceptAllegation?: (allegationId: string) => void
  onRejectAllegation?: (allegationId: string) => void
  onVerifyFinding?: (findingId: string) => void
  onRejectFinding?: (findingId: string) => void
}

export function AllegationDisplay({
  lead,
  verifiedFindings,
  reviewQueue,
  allegations = [],
  verifiedItems = [],
  reviewItems = [],
  onAcceptAllegation,
  onRejectAllegation,
  onVerifyFinding,
  onRejectFinding,
}: AllegationDisplayProps) {
  return (
    <div
      style={{
        background: '#161d24',
        border: '1px solid #3e4f5f',
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 6,
      }}
    >
      <strong>Resultado do inquiry ({lead})</strong>
      <div style={{ color: '#a7d3b7' }}>Findings verificados: {verifiedFindings}</div>
      <div style={{ color: '#f1cda0' }}>Em review queue: {reviewQueue}</div>

      {allegations.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13 }}>Alegações</strong>
          {allegations.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gap: 6,
                border: '1px solid #304254',
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div style={{ fontSize: 13 }}>
                <strong>{item.id}</strong>: {item.statement}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onAcceptAllegation?.(item.id)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #2d8756',
                    background: '#1f6b45',
                    color: 'white',
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Aceitar alegação
                </button>
                <button
                  type="button"
                  onClick={() => onRejectAllegation?.(item.id)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #9d4343',
                    background: '#7f3232',
                    color: 'white',
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Recusar alegação
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {verifiedItems.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13, color: '#a7d3b7' }}>Findings já verificados</strong>
          {verifiedItems.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid #2f5b40',
                borderRadius: 6,
                padding: 8,
                fontSize: 13,
              }}
            >
              <strong>{item.id}</strong>: {item.claim}
            </div>
          ))}
        </div>
      ) : null}

      {reviewItems.length > 0 ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <strong style={{ fontSize: 13, color: '#f1cda0' }}>Findings para revisão</strong>
          {reviewItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'grid',
                gap: 6,
                border: '1px solid #6d5938',
                borderRadius: 6,
                padding: 8,
              }}
            >
              <div style={{ fontSize: 13 }}>
                <strong>{item.id}</strong>: {item.claim}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onVerifyFinding?.(item.id)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #2d8756',
                    background: '#1f6b45',
                    color: 'white',
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Verificar finding
                </button>
                <button
                  type="button"
                  onClick={() => onRejectFinding?.(item.id)}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #9d4343',
                    background: '#7f3232',
                    color: 'white',
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Rejeitar finding
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {reviewQueue > 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          Sugestão: revisar evidências fracas e executar nova rodada de inquiry.
        </div>
      ) : null}
    </div>
  )
}
