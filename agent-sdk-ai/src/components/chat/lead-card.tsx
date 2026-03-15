interface LeadCardProps {
  title: string
  onInvestigate: () => void
  onReject: () => void
}

export function LeadCard({ title, onInvestigate, onReject }: LeadCardProps) {
  return (
    <div
      style={{
        background: '#101724',
        border: '1px solid #335174',
        borderRadius: 8,
        padding: 10,
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onInvestigate}
          style={{
            borderRadius: 8,
            border: '1px solid #2d8756',
            background: '#1f6b45',
            color: 'white',
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          Investigar
        </button>
        <button
          type="button"
          onClick={onReject}
          style={{
            borderRadius: 8,
            border: '1px solid #9d4343',
            background: '#7f3232',
            color: 'white',
            padding: '6px 10px',
            cursor: 'pointer',
          }}
        >
          Rejeitar
        </button>
      </div>
    </div>
  )
}
