import { useState } from 'react'

export default function ChangeLog({ entries }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="changelog">
      <button className="changelog-toggle" onClick={() => setOpen((o) => !o)}>
        <span>Cambios de horario {entries.length > 0 && `(${entries.length})`}</span>
        <span>{open ? '▼' : '▲'}</span>
      </button>
      {open && (
        <div className="changelog-body">
          {entries.length === 0 ? (
            <div className="changelog-empty">Sin cambios detectados</div>
          ) : (
            [...entries].reverse().map((entry, i) => (
              <div key={i} className="changelog-entry">
                <div className="changelog-entry-header">
                  <span className="changelog-fighter">{entry.fighter}</span>
                  <span className="changelog-time">{entry.timestamp}</span>
                </div>
                <div className="changelog-detail">
                  {entry.field}:{' '}
                  <strong>{entry.from}</strong> → <strong>{entry.to}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
