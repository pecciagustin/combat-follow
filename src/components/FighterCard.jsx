export default function FighterCard({ fighter, matchData, isLoading, isChanged }) {
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
  ]
    .filter(Boolean)
    .join(' ')

  const hasData = matchData && status !== 'notfound' && status !== 'error'

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
          <div className={`card-time${!matchData.time ? ' muted' : ''}`}>
            {matchData.time || '--:--'}
          </div>
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
              </div>
            )}
          </div>
        </>
      )}

      {!isLoading && !matchData && (
        <div className="card-message">Presiona ↻ para actualizar</div>
      )}
    </div>
  )
}
