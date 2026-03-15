interface AllegationDisplayProps {
  lead: string
  verifiedFindings: number
  reviewQueue: number
}

export function AllegationDisplay({
  lead,
  verifiedFindings,
  reviewQueue,
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
      {reviewQueue > 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          Sugestão: revisar evidências fracas e executar nova rodada de inquiry.
        </div>
      ) : null}
    </div>
  )
}
