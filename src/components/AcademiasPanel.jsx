import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { scrapeEventMatches } from '../api/scrape'

const ACADEMIA_KEY = (eventId) => `combat-follow-academia-${eventId}`

const cleanCat = (c) => (c || '').replace(/\s*\(Day \d+\)/i, '').trim()

// Smoothcomp mat names are sometimes "Mat 1" and sometimes just "1"; normalize
// so we never render "Mat Mat 1".
const matLabel = (mat) => (/^mat\b/i.test(String(mat)) ? mat : `Mat ${mat}`)

function StatusBadge({ status }) {
  if (status === 'live') return <span className="badge badge-live">En vivo</span>
  return <span className="badge badge-upcoming">Próximo</span>
}

export default function AcademiasPanel({ activeEvent, events, activeEventId, onSelectEvent }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [supported, setSupported] = useState(true)
  const [matches, setMatches] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const reqRef = useRef(0)

  const eventUrl = activeEvent?.matchlistUrl || ''

  const fetchMatches = useCallback(() => {
    if (!eventUrl) {
      setLoading(false); setError(null); setSupported(true); setMatches([]); setLoaded(true)
      return
    }
    const token = ++reqRef.current
    setLoading(true); setError(null)
    scrapeEventMatches(eventUrl)
      .then((res) => {
        if (token !== reqRef.current) return
        setSupported(res.supported)
        setMatches(res.matches || [])
        setLoaded(true)
      })
      .catch((err) => {
        if (token !== reqRef.current) return
        setError(err.message || 'Error al obtener datos del evento')
        setMatches([])
        setLoaded(true)
      })
      .finally(() => {
        if (token === reqRef.current) setLoading(false)
      })
  }, [eventUrl])

  // Load remembered academy per event + refetch when the active event changes.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on event change */
  useEffect(() => {
    setSearch('')
    setLoaded(false)
    try {
      setSelected(activeEventId ? localStorage.getItem(ACADEMIA_KEY(activeEventId)) || '' : '')
    } catch {
      setSelected('')
    }
    fetchMatches()
  }, [activeEventId, fetchMatches])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Only pending combats (upcoming + live); finished are hidden.
  const pending = useMemo(() => matches.filter((m) => m.status !== 'finished'), [matches])

  // Academies present among pending combats, alphabetical, with a pending count.
  const academias = useMemo(() => {
    const counts = new Map()
    for (const m of pending) {
      const seen = new Set()
      for (const s of m.seats) {
        if (!s.club) continue
        const key = s.club.toLowerCase()
        if (seen.has(key)) continue // a club appearing on both seats counts once
        seen.add(key)
        const prev = counts.get(key)
        if (prev) prev.count += 1
        else counts.set(key, { club: s.club, count: 1 })
      }
    }
    return [...counts.values()].sort((a, b) => a.club.localeCompare(b.club))
  }, [pending])

  const filteredAcademias = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return academias
    return academias.filter((a) => a.club.toLowerCase().includes(q))
  }, [academias, search])

  const selectedMatches = useMemo(() => {
    if (!selected) return []
    const sel = selected.toLowerCase()
    return pending
      .filter((m) => m.seats.some((s) => s.club && s.club.toLowerCase() === sel))
      .sort((a, b) => {
        if (a._start == null && b._start == null) return 0
        if (a._start == null) return 1
        if (b._start == null) return -1
        return a._start - b._start
      })
  }, [pending, selected])

  const chooseAcademia = (club) => {
    setSelected(club)
    try { localStorage.setItem(ACADEMIA_KEY(activeEventId), club) } catch { /* ignore */ }
  }
  const clearAcademia = () => {
    setSelected('')
    try { localStorage.removeItem(ACADEMIA_KEY(activeEventId)) } catch { /* ignore */ }
  }

  const eventChips = events.length > 1 && (
    <div className="event-chips" style={{ padding: '12px 16px 0' }}>
      {events.map((ev) => (
        <button
          key={ev.id}
          className={`event-chip${ev.id === activeEventId ? ' active' : ''}`}
          onClick={() => onSelectEvent(ev.id)}
        >
          {ev.name}
        </button>
      ))}
    </div>
  )

  const toolbar = (
    <div className="panel-toolbar">
      <label>Academias{activeEvent ? ` · ${activeEvent.name}` : ''}</label>
      <div className="spacer" />
      <button
        className="btn-ghost"
        style={{ fontSize: 12, minHeight: 32, gap: 6 }}
        onClick={fetchMatches}
        disabled={loading || !eventUrl}
      >
        ↻ {loading ? 'Cargando…' : 'Actualizar'}
      </button>
    </div>
  )

  // ── Blocking states ───────────────────────────────────
  let body
  if (!activeEventId) {
    body = (
      <div className="empty-state">
        <h2>Sin evento</h2>
        <p>Crea un evento en la pestaña Setup para explorar por academia.</p>
      </div>
    )
  } else if (!eventUrl) {
    body = (
      <div className="empty-state">
        <h2>Sin match list</h2>
        <p>Este evento no tiene una match list configurada.</p>
      </div>
    )
  } else if (loaded && !supported) {
    body = (
      <div className="empty-state">
        <h2>No disponible</h2>
        <p>El filtro por academia solo está disponible en eventos de Smoothcomp.</p>
      </div>
    )
  } else if (loading && !loaded) {
    body = (
      <div className="empty-state">
        <p>Cargando combates del evento…</p>
      </div>
    )
  } else if (error) {
    body = (
      <div className="empty-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button className="btn-primary" onClick={fetchMatches}>Reintentar</button>
      </div>
    )
  } else if (academias.length === 0) {
    body = (
      <div className="empty-state">
        <h2>Sin academias</h2>
        <p>No hay combates pendientes con academia asignada en este evento.</p>
      </div>
    )
  } else if (!selected) {
    // ── Academy picker ──────────────────────────────────
    body = (
      <div className="cards-scroll">
        <input
          className="academia-search"
          type="text"
          placeholder="Buscar academia…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <div className="academia-list">
          {filteredAcademias.length === 0 ? (
            <div className="card-message">Sin resultados para «{search}»</div>
          ) : (
            filteredAcademias.map((a) => (
              <button key={a.club} className="academia-row" onClick={() => chooseAcademia(a.club)}>
                <span className="academia-name">{a.club}</span>
                <span className="academia-count">{a.count}</span>
              </button>
            ))
          )}
        </div>
      </div>
    )
  } else {
    // ── Selected academy results ────────────────────────
    body = (
      <div className="cards-scroll">
        <div className="academia-selected-bar">
          <div className="academia-selected-name">{selected}</div>
          <button className="btn-ghost" style={{ minHeight: 32, fontSize: 12 }} onClick={clearAcademia}>
            Cambiar
          </button>
        </div>
        {selectedMatches.length === 0 ? (
          <div className="card-message">Sin combates pendientes para esta academia.</div>
        ) : (
          <div className="academia-matches">
            {selectedMatches.map((m) => (
              <div key={m.id} className="academia-match">
                <div className="academia-match-time">
                  <div className="am-time">{m.time || '--:--'}</div>
                  {m.mat && <div className="am-mat">{matLabel(m.mat)}</div>}
                </div>
                <div className="academia-match-body">
                  <div className="am-fighters">
                    {m.seats.length === 0 ? (
                      <span className="am-tbd">Por definir</span>
                    ) : (
                      m.seats.map((s, i) => {
                        const mine = s.club && s.club.toLowerCase() === selected.toLowerCase()
                        return (
                          <span key={i}>
                            {i > 0 && <span className="am-vs"> vs </span>}
                            <span className={mine ? 'am-fighter mine' : 'am-fighter'}>{s.name}</span>
                            {s.club && <span className="am-club"> ({s.club})</span>}
                          </span>
                        )
                      })
                    )}
                  </div>
                  {m.category && <div className="am-cat">{cleanCat(m.category)}</div>}
                </div>
                <div className="academia-match-status">
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel-screen">
      {eventChips}
      {toolbar}
      {body}
    </div>
  )
}
