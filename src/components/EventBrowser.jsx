import { useEffect, useMemo, useState } from 'react'
import { IconClose } from './icons'
import { fetchAllEvents } from '../api/scrape'

// Session cache: the index is ~1MB, so we only fetch it once per session and
// reuse it every time the browser is reopened.
let eventsCache = null

// Turn a 2-letter ISO country code into its flag emoji (regional indicators).
function flagEmoji(code) {
  if (!code || code.length !== 2) return ''
  const base = 0x1f1e6
  const A = 'A'.charCodeAt(0)
  const cc = code.toUpperCase()
  return String.fromCodePoint(base + (cc.charCodeAt(0) - A), base + (cc.charCodeAt(1) - A))
}

const inputStyle = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 14, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' }

// One-click event picker fed from Smoothcomp's public upcoming-events index.
// onPick(name, matchlistUrl) creates the event in the parent.
export default function EventBrowser({ onPick, onClose }) {
  const [events, setEvents] = useState(eventsCache || [])
  const [loading, setLoading] = useState(!eventsCache)
  const [error, setError] = useState('')
  const [country, setCountry] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (eventsCache) return
    let cancelled = false
    fetchAllEvents()
      .then((list) => { if (!cancelled) { eventsCache = list; setEvents(list) } })
      .catch((e) => { if (!cancelled) setError(e.message || 'No se pudo cargar la lista de eventos') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Countries present in the data, alphabetical, each with its event count.
  // Keyed by ISO code so a country coming from both feeds isn't duplicated.
  const countries = useMemo(() => {
    const counts = new Map()
    for (const e of events) {
      if (!e.country) continue
      const prev = counts.get(e.country)
      if (prev) prev.count += 1
      else counts.set(e.country, { code: e.country, name: e.countryName || e.country, count: 1 })
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [events])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (country && e.country !== country) return false
      if (q && !e.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [events, country, search])

  const pick = (e) => {
    const base = e.url.replace(/\/+$/, '')
    onPick(e.title, `${base}/schedule/matchlist`)
  }

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal notif-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
        <div className="qr-header">
          <div className="qr-title">Buscar evento</div>
          <button className="qr-close" onClick={onClose} aria-label="Cerrar"><IconClose size={16} /></button>
        </div>

        {loading ? (
          <p className="login-text" style={{ margin: '8px 0' }}>Cargando eventos…</p>
        ) : error ? (
          <div style={{ textAlign: 'left' }}>
            <p className="login-error" style={{ margin: '8px 0' }}>{error}</p>
            <p className="login-text" style={{ margin: '8px 0', fontSize: 12 }}>
              Podés cargar el evento manualmente pegando la URL de la match list.
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'left' }}>
            {/* Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filtrar por país"
                style={inputStyle}
              >
                <option value="">Todos los países ({events.length})</option>
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {flagEmoji(c.code)} {c.name} ({c.count})
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Buscar por nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                style={inputStyle}
              />
            </div>

            {/* Scrollable results */}
            <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.length === 0 ? (
                <div className="fighter-list-empty">Sin eventos para estos filtros.</div>
              ) : (
                filtered.map((e) => (
                  <button
                    key={e.id}
                    className="event-result-row"
                    onClick={() => pick(e)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{flagEmoji(e.country)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {[e.city, e.countryName].filter(Boolean).join(', ')}{e.period ? ` · ${e.period}` : ''}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
            {filtered.length > 0 && (
              <p className="login-text" style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-secondary)' }}>
                {filtered.length} evento{filtered.length === 1 ? '' : 's'} · tocá uno para cargarlo
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
