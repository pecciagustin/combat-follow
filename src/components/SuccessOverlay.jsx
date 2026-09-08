// Full-screen lime confirmation shown after server monitoring is activated.
export default function SuccessOverlay({ eventName, count, onClose }) {
  return (
    <div className="success-overlay">
      <div className="success-inner">
        <div className="success-check">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div className="success-title">Monitoreo activado</div>
        <p className="success-text">
          El servidor revisará los horarios cada 2 minutos y te avisará por email ante cualquier cambio.
        </p>
        <div className="success-chip">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4v7a6 6 0 0 0 12 0V4" />
            <path d="M9 20h6" />
          </svg>
          {eventName ? `${eventName} · ` : ''}{count} {count === 1 ? 'peleador' : 'peleadores'}
        </div>
        <p className="success-note">Se monitorea un evento a la vez (el último que actives).</p>
      </div>
      <button className="success-btn" onClick={onClose}>Listo</button>
    </div>
  )
}
