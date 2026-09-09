import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { listTournaments } from '../api/tournaments'

function fighterLabel(f) {
  if (f.trackMode === 'fight') return `Mat ${f.mat} · #${f.fightNum}`
  if (f.discipline) return f.discipline === 'gi' ? 'GI' : 'No-Gi'
  return ''
}

// Read-only archive of all tournaments the user has created, synced to their
// account. Opened from the account menu. Tapping a tournament expands its fighters.
export default function MyTournamentsModal({ credential, onClose }) {
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(!!credential)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    if (!credential) return
    let cancelled = false
    listTournaments(credential)
      .then((list) => { if (!cancelled) setTournaments(list) })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [credential])

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal notif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Mis torneos</div>
          <button className="qr-close" onClick={onClose} aria-label="Cerrar"><IconClose size={16} /></button>
        </div>

        <div style={{ textAlign: 'left' }}>
          {!credential ? (
            <p className="login-text" style={{ margin: '8px 0' }}>
              Iniciá sesión para ver los torneos guardados en tu cuenta.
            </p>
          ) : loading ? (
            <p className="login-text" style={{ margin: '8px 0' }}>Cargando…</p>
          ) : error ? (
            <p className="login-error" style={{ margin: '8px 0' }}>{error}</p>
          ) : tournaments.length === 0 ? (
            <p className="login-text" style={{ margin: '8px 0' }}>
              Todavía no guardaste ningún torneo. Creá uno y agregá luchadores: quedan guardados acá automáticamente.
            </p>
          ) : (
            <div className="fighter-list">
              {tournaments.map((t) => {
                const open = expandedId === t.id
                const fighters = Array.isArray(t.fighters) ? t.fighters : []
                return (
                  <div key={t.id} className="fighter-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    <button
                      className="tournament-row"
                      onClick={() => setExpandedId(open ? null : t.id)}
                      aria-expanded={open}
                    >
                      <div className="fighter-item-info">
                        <div className="fighter-item-name">{t.name}</div>
                        <div className="fighter-item-url">
                          {fighters.length} {fighters.length === 1 ? 'luchador' : 'luchadores'}
                        </div>
                      </div>
                      <span className="tournament-caret" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
                    </button>
                    {open && (
                      fighters.length === 0 ? (
                        <div className="fighter-list-empty" style={{ padding: '6px 0' }}>Sin luchadores.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 4 }}>
                          {fighters.map((f, i) => {
                            const label = fighterLabel(f)
                            return (
                              <div key={i} className="tournament-fighter">
                                <span>{f.name}</span>
                                {label && <span className="tournament-fighter-tag">{label}</span>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
