export default function Header({ isMonitoring, lastUpdated, onRefresh, isLoading }) {
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <header className="header">
      <div className="header-title">
        <div className={`pulse-dot${isMonitoring ? ' active' : ''}`} />
        COMBAT FOLLOW
      </div>
      <div className="header-actions">
        {timeStr && <span className="header-updated">{timeStr}</span>}
        <button
          className="btn-icon"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh now"
          aria-label="Refresh now"
        >
          {isLoading ? '⏳' : '↻'}
        </button>
      </div>
    </header>
  )
}
