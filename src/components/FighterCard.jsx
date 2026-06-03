import { useState } from 'react'

const PLACEMENT_LABEL = { 1: '🥇 1er lugar', 2: '🥈 2do lugar', 3: '🥉 3er lugar' }

export default function FighterCard({ fighter, matchData, isLoading, isChanged, onNoteChange }) {
  const [treeOpen, setTreeOpen] = useState(false)
  const status = matchData?.status

  function getStatusBadge() {
    if (isLoading) return <span className="badge badge-loading">Cargando…</span>
    if (!matchData) return null
    if (status === 'live') return <span className="badge badge-live">En vivo</span>
    if (status === 'upcoming') return <span className="badge badge-upcoming">Próximo</span>
    if (status === 'finished') return <span className="badge badge-finished">Finalizado</span>
    if (status === 'notfound') return <span className="badge badge-notfound">Sin partido</span>
    if (status === 'error') return <span className="badge badge-error">Error</span>
    return null
  }

  const cardClass = [
    'fighter-card',
    isChanged ? 'changed' : '',
    status === 'live' && !isChanged ? 'live' : '',
  ].filter(Boolean).join(' ')

  const hasData = matchData && status !== 'notfound' && status !== 'error'
  const fights = matchData?.fights || []

  return (
    <div className={cardClass}>
      <div className="card-top">
        <div className="card-name">{fighter.name}</div>
        <div className="card-badges">
          {isChanged && <span className="badge badge-changed">Horario cambiado</span>}
          {getStatusBadge()}
        </div>
      </div>

      {isLoading && !matchData && (
        <>
          <div className="card-time muted">--:--</div>
          <div className="card-opponent-label">Cargando datos…</div>
        </>
      )}

      {!isLoading && status === 'error' && (
        <div className="card-message error">{matchData?.message || 'Error al obtener datos'}</div>
      )}

      {!isLoading && status === 'notfound' && (
        <div className="card-message">Sin partidos encontrados</div>
      )}

      {hasData && (
        <>
          {/* Placement banner */}
          {matchData.placement && (
            <div className="card-placement">{PLACEMENT_LABEL[matchData.placement] || `#${matchData.placement}`}</div>
          )}

          <div className={`card-time${!matchData.time ? ' muted' : ''}`}>
            {matchData.time || '--:--'}
          </div>

          {matchData.round && (
            <div className="card-round">{matchData.round}</div>
          )}

          {matchData.opponent && (
            <>
              <div className="card-opponent-label">vs</div>
              <div className="card-opponent">{matchData.opponent}</div>
            </>
          )}

          <div className="card-meta">
            <div className="card-category">{matchData.category || '—'}</div>
            {matchData.mat && (
              <div className="card-mat">
                Mat <span>{matchData.mat}</span>
                {matchData.fight && <> · Fight <span>{matchData.fight}</span></>}
              </div>
            )}
          </div>

          {/* Fight tree */}
          {fights.length > 1 && (
            <div className="card-tree">
              <button className="card-tree-toggle" onClick={() => setTreeOpen((o) => !o)}>
                Ver bracket ({fights.length} peleas) {treeOpen ? '▲' : '▼'}
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

      {!isLoading && !matchData && (
        <div className="card-message">Presiona ↻ para actualizar</div>
      )}

      <textarea
        className="card-note"
        placeholder="Nota…"
        value={fighter.note || ''}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={1}
      />
    </div>
  )
}
