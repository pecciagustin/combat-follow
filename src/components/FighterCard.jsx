import { useState } from 'react'

const PLACEMENT_LABEL = { 1: '🥇 1er lugar', 2: '🥈 2do lugar', 3: '🥉 3er lugar' }

export default function FighterCard({ fighter, matchData, isLoading, isChanged, isUrgent, onNoteChange }) {
  const [expanded, setExpanded] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const status = matchData?.status

  function getStatusBadge() {
    if (isLoading) return <span className="badge badge-loading">…</span>
    if (!matchData) return null
    if (isUrgent) return <span className="badge badge-live">⚡ &lt;10 min</span>
    if (status === 'live') return <span className="badge badge-live">En vivo</span>
    if (status === 'upcoming') return <span className="badge badge-upcoming">Próximo</span>
    if (status === 'finished') return <span className="badge badge-finished">Finalizado</span>
    if (status === 'notfound') return <span className="badge badge-notfound">Sin asignar</span>
    if (status === 'error') return <span className="badge badge-error">Error</span>
    return null
  }

  const cardClass = [
    'fighter-card',
    isUrgent ? 'urgent' : '',
    isChanged && !isUrgent ? 'changed' : '',
    status === 'live' && !isChanged && !isUrgent ? 'live' : '',
  ].filter(Boolean).join(' ')

  const hasData = matchData && status !== 'notfound' && status !== 'error'
  const fights = matchData?.fights || []

  return (
    <div className={cardClass}>
      {/* ── Compact row (always visible) ── */}
      <div className="card-compact" onClick={() => setExpanded((o) => !o)}>
        <div className="card-compact-left">
          <div className="card-name">
            {fighter.name}
            {(fighter.discipline || matchData?.category) && (
              <span className="card-name-type">
                {fighter.discipline === 'nogi' ? ' (No-Gi)'
                  : fighter.discipline === 'gi' ? ' (Gi)'
                  : matchData?.category && (/no.?gi/i.test(matchData.category) ? ' (No-Gi)' : /\bgi\b/i.test(matchData.category) ? ' (Gi)' : '')}
              </span>
            )}
          </div>
          {isChanged && <span className="badge badge-changed" style={{ marginTop: 3 }}>Horario cambiado</span>}
        </div>

        <div className="card-compact-center">
          {hasData ? (
            <>
              <div className="card-time-compact">{matchData.time || '--:--'}</div>
              {matchData.mat && (
                <div className="card-mat-compact">
                  Mat <strong>{matchData.mat}</strong>
                  {matchData.fight && <> · #{matchData.fight}</>}
                </div>
              )}
              {matchData.category && (
                <div className="card-mat-compact" style={{ opacity: 0.6, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {matchData.category.replace(/Men's|Women's|Youth Men's|Youth Women's/i, '').trim()}
                </div>
              )}
            </>
          ) : (
            <div className="card-time-compact muted">
              {isLoading ? '…' : status === 'notfound' ? 'Sin asignar' : '--:--'}
            </div>
          )}
        </div>

        <div className="card-compact-right">
          {getStatusBadge()}
          <span className="card-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="card-detail">
          {isLoading && (
            <div className="card-message">Cargando datos…</div>
          )}
          {!isLoading && status === 'error' && (
            <div className="card-message error">{matchData?.message || 'Error al obtener datos'}</div>
          )}
          {!isLoading && status === 'notfound' && (
            <div className="card-message">Sin combates encontrados</div>
          )}
          {!isLoading && !matchData && (
            <div className="card-message">Presiona ↻ para actualizar</div>
          )}

          {hasData && (
            <>
              {matchData.placement && (
                <div className="card-placement">{PLACEMENT_LABEL[matchData.placement] || `#${matchData.placement}`}</div>
              )}
              {matchData.round && <div className="card-round">{matchData.round}</div>}
              {matchData.opponent && (
                <>
                  <div className="card-opponent-label">vs</div>
                  <div className="card-opponent">{matchData.opponent}</div>
                </>
              )}
              <div className="card-meta">
                <div className="card-category">{matchData.category || '—'}</div>
              </div>

              {fights.length > 1 && (
                <div className="card-tree">
                  <button className="card-tree-toggle" onClick={(e) => { e.stopPropagation(); setTreeOpen((o) => !o) }}>
                    Ver bracket ({fights.length} combates) {treeOpen ? '▲' : '▼'}
                  </button>
                  {treeOpen && (
                    <div className="card-tree-body">
                      {fights.map((f, i) => (
                        <div key={i} className="card-tree-row">
                          <div className="card-tree-round">{f.roundName || `Pelea ${i + 1}`}</div>
                          <div className="card-tree-detail">
                            <span className="card-tree-ref">{f.matchRef}</span>
                            {' vs '}
                            <span className="card-tree-opponent">{f.opponent}</span>
                            {f.result && <span className="card-tree-result">#{f.result}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <textarea
            className="card-note"
            placeholder="Nota…"
            value={fighter.note || ''}
            onChange={(e) => { e.stopPropagation(); onNoteChange(e.target.value) }}
            rows={1}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
