import { useState, useEffect, useRef, useCallback } from 'react'
import LZString from 'lz-string'
import Header from './components/Header'
import SetupPanel from './components/SetupPanel'
import FighterCard from './components/FighterCard'
import { scrapeAllFighters } from './api/scrape'
import QRModal from './components/QRModal'
import QRScanner from './components/QRScanner'
import LoginScreen from './components/LoginScreen'
import StatusScreen from './components/StatusScreen'
import AdminPanel from './components/AdminPanel'
import SuccessOverlay from './components/SuccessOverlay'
import NotificationsModal from './components/NotificationsModal'
import { IconGear } from './components/icons'
import { useAuth } from './auth/useAuth'

// v2: match list moved to the event level; fighters no longer carry a URL.
// Bumping the keys starts fresh and ignores legacy data (kept intact, reversible).
const STORAGE_KEY = 'combat-follow-fighters-v2'
const EMAIL_CONFIG_KEY = 'combat-follow-email'
const EVENTS_KEY = 'combat-follow-events-v2'
const ACTIVE_EVENT_KEY = 'combat-follow-active-event-v2'

function decodeImportParam(params) {
  const z = params.get('importz')
  if (z) return JSON.parse(LZString.decompressFromEncodedURIComponent(z))
  const plain = params.get('import')
  if (plain) return JSON.parse(decodeURIComponent(escape(atob(plain))))
  return null
}

function loadEmailConfig() {
  try {
    const raw = localStorage.getItem(EMAIL_CONFIG_KEY)
    return raw ? JSON.parse(raw) : { serviceId: '', templateId: '', publicKey: '', toEmail: '' }
  } catch {
    return { serviceId: '', templateId: '', publicKey: '', toEmail: '' }
  }
}
const INTERVALS = [
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
]

function loadFighters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveFighters(fighters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fighters))
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveEvents(events) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events))
}

function loadActiveEventId() {
  try {
    return localStorage.getItem(ACTIVE_EVENT_KEY) || null
  } catch {
    return null
  }
}

// Normalize stored state. Unlike the old migration, this does NOT create a
// default event: with no events we render an empty state instead. It only keeps
// fighters tagged to a valid event and the active id consistent.
// Returns { events, fighters, activeEventId } — activeEventId may be null.
function normalizeState(events, fighters, activeEventId) {
  if (events.length === 0) {
    return { events: [], fighters: [], activeEventId: null }
  }

  // Drop fighters pointing to a deleted/unknown event.
  const validIds = new Set(events.map((e) => e.id))
  const nextFighters = fighters.filter((f) => validIds.has(f.eventId))

  if (!activeEventId || !validIds.has(activeEventId)) {
    activeEventId = events[0].id
  }

  return { events, fighters: nextFighters, activeEventId }
}

function vibrate() {
  if (!navigator.vibrate) return
  navigator.vibrate([300, 100, 300, 100, 300])
}

function minutesUntil(timeStr) {
  if (!timeStr) return null
  const now = new Date()
  const [h, m] = timeStr.split(':').map(Number)
  const fight = new Date(now)
  fight.setHours(h, m, 0, 0)
  return Math.round((fight - now) / 60000)
}

function gridClass(count) {
  if (count === 1) return 'count-1'
  if (count === 2) return 'count-2'
  if (count <= 4) return 'count-3'
  return 'count-many'
}

const svg = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }
function IconPanel() {
  return <svg width="23" height="23" viewBox="0 0 24 24" {...svg}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
}
function IconSetup() {
  return <svg width="23" height="23" viewBox="0 0 24 24" {...svg}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /><circle cx="9" cy="7" r="2" fill="var(--card-bg)" /><circle cx="15" cy="12" r="2" fill="var(--card-bg)" /><circle cx="8" cy="17" r="2" fill="var(--card-bg)" /></svg>
}
function IconAdmin() {
  return <svg width="23" height="23" viewBox="0 0 24 24" {...svg}><path d="M12 3 5 6v5c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3z" /></svg>
}
function IconPlus() {
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}

export default function App() {
  const { user, status, isAdmin, credential, checking, error: authError, signIn, signOut } = useAuth()
  const [tab, setTab] = useState('panel')
  // Normalize once so events/fighters/active id are consistent from render 1.
  const [seed] = useState(() => normalizeState(loadEvents(), loadFighters(), loadActiveEventId()))
  const [fighters, setFighters] = useState(seed.fighters)
  const [events, setEvents] = useState(seed.events)
  const [activeEventId, setActiveEventId] = useState(seed.activeEventId)
  const [matchMap, setMatchMap] = useState({})
  const [urgentIds, setUrgentIds] = useState(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalSec, setIntervalSec] = useState(120)
  const [emailConfig, setEmailConfig] = useState(loadEmailConfig)
  const [showQR, setShowQR] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [successInfo, setSuccessInfo] = useState(null)
  const [showNotifications, setShowNotifications] = useState(false)

  function saveEmailConfig(cfg) {
    setEmailConfig(cfg)
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(cfg))
  }
  const intervalRef = useRef(null)
  const isLoadingRef = useRef(false) // ref-based lock — never stale in closures

  useEffect(() => {
    saveFighters(fighters)
  }, [fighters])

  useEffect(() => {
    saveEvents(events)
  }, [events])

  useEffect(() => {
    if (activeEventId) localStorage.setItem(ACTIVE_EVENT_KEY, activeEventId)
    else localStorage.removeItem(ACTIVE_EVENT_KEY)
  }, [activeEventId])

  // Fighters belonging to the currently selected event.
  const activeFighters = fighters.filter((f) => f.eventId === activeEventId)

  const refresh = useCallback(async () => {
    // Only refresh the fighters of the active event, injecting the event's
    // match list URL into each one (fighters no longer carry their own URL).
    const ev = events.find((e) => e.id === activeEventId)
    const eventUrl = ev?.matchlistUrl || ''
    if (!eventUrl) return
    const toScrape = fighters
      .filter((f) => f.eventId === activeEventId)
      .map((f) => ({ ...f, matchlistUrl: eventUrl, bracketUrl: eventUrl }))
    if (toScrape.length === 0) return
    if (isLoadingRef.current) return  // debounce — reliable ref, never stale
    isLoadingRef.current = true
    setIsLoading(true)
    try {
      const results = await scrapeAllFighters(toScrape)
      const now = new Date()

      const newUrgentIds = new Set()

      setMatchMap((prev) => {
        const next = { ...prev }
        results.forEach(({ id, data, error }) => {
          if (error) { next[id] = { status: 'error', message: error }; return }
          next[id] = data
        })
        return next
      })

      // Mark urgent (red) when <10 min — visual only, email handled by server cron
      results.forEach(({ id, data }) => {
        if (!data?.time || data.status === 'notfound') return
        const mins = minutesUntil(data.time)
        if (mins !== null && mins >= 0 && mins < 10) {
          newUrgentIds.add(id)
          vibrate()
        }
      })

      setUrgentIds(newUrgentIds)
      setLastUpdated(now)
    } catch (err) {
      console.error('Refresh error:', err)
    } finally {
      isLoadingRef.current = false
      setIsLoading(false)
    }
  }, [fighters, events, activeEventId])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (activeFighters.length === 0) return
    intervalRef.current = setInterval(refresh, intervalSec * 1000)
    return () => clearInterval(intervalRef.current)
  }, [refresh, intervalSec, activeFighters.length])

  // Import fighters from a decoded payload (array | { fighters, email, eventName }).
  // If the payload names an event, import into that event (creating it if needed)
  // and make it active; otherwise import into the current active event.
  // Dedupe is scoped to the target event. Returns the number of fighters added.
  const importDecoded = useCallback((decoded) => {
    if (!decoded) return 0
    const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
    const importedEmail = !Array.isArray(decoded) ? decoded.email : null
    const eventName = !Array.isArray(decoded) ? (decoded.eventName || '').trim() : ''
    // Event-level match list URL. New payloads carry `eventUrl`; legacy payloads
    // only had per-fighter URLs, so fall back to the first fighter's url.
    const eventUrl = (
      (!Array.isArray(decoded) && decoded.eventUrl) ||
      importedFighters.map((f) => f.url || f.matchlistUrl || f.bracketUrl).find(Boolean) ||
      ''
    )

    // Resolve the target event. Without an event name, import into the active
    // event; if there is none, create one from the payload (or a default name).
    let targetId = activeEventId
    if (eventName) {
      const existing = events.find((e) => e.name.toLowerCase() === eventName.toLowerCase())
      if (existing) {
        targetId = existing.id
        // Backfill the match list URL if this event doesn't have one yet.
        if (eventUrl && !existing.matchlistUrl) {
          setEvents((prev) => prev.map((e) => (e.id === existing.id ? { ...e, matchlistUrl: eventUrl } : e)))
        }
      } else {
        const newEvent = { id: crypto.randomUUID(), name: eventName, matchlistUrl: eventUrl }
        targetId = newEvent.id
        setEvents((prev) => [...prev, newEvent])
      }
      setActiveEventId(targetId)
    } else if (!targetId) {
      const newEvent = { id: crypto.randomUUID(), name: 'Evento importado', matchlistUrl: eventUrl }
      targetId = newEvent.id
      setEvents((prev) => [...prev, newEvent])
      setActiveEventId(targetId)
    }

    // Dedupe within the target event. Fighters no longer carry a URL, so the key
    // is the mat/fight slot (fight mode) or the lowercased name + discipline.
    const fighterKey = (f) => f.trackMode === 'fight'
      ? `fight:${f.mat}:${f.fightNum}`
      : `name:${(f.name || '').toLowerCase()}:${f.discipline || ''}`
    const existingKeys = new Set(
      fighters.filter((f) => f.eventId === targetId).map(fighterKey)
    )
    const toAdd = importedFighters
      .filter((f) => !existingKeys.has(fighterKey(f)))
      .map((f) => {
        // Keep only the new model's fields; drop any per-fighter URL.
        const base = { id: crypto.randomUUID(), eventId: targetId, name: f.name }
        if (f.trackMode === 'fight') return { ...base, trackMode: 'fight', mat: f.mat, fightNum: f.fightNum }
        return { ...base, discipline: f.discipline || null }
      })
    if (toAdd.length > 0) setFighters((prev) => [...prev, ...toAdd])

    if (importedEmail?.serviceId) {
      setEmailConfig(importedEmail)
      localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(importedEmail))
    }
    return toAdd.length
  }, [activeEventId, events, fighters])

  // On load: check for ?import= / ?importz= param and merge fighters from QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('import') || params.get('importz')) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time import on mount
        importDecoded(decodeImportParam(params))
      } catch { /* ignore bad param */ }
      // Clean the URL without reloading
      window.history.replaceState({}, '', window.location.pathname)
    }
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearAllFighters() {
    const ev = events.find((e) => e.id === activeEventId)
    const label = ev ? `«${ev.name}»` : 'este evento'
    if (!window.confirm(`¿Eliminar todos los luchadores de ${label}?`)) return
    setFighters((prev) => prev.filter((f) => f.eventId !== activeEventId))
    setMatchMap((prev) => {
      const next = { ...prev }
      for (const f of fighters) if (f.eventId === activeEventId) delete next[f.id]
      return next
    })
    setUrgentIds(new Set())
  }

  function editFighter(id, updates) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f))
  }

  function updateNote(id, note) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, note } : f))
  }

  function addFighter(fighter) {
    if (!activeEventId) return  // no active event → nothing to attach to
    const newFighter = { ...fighter, id: crypto.randomUUID(), eventId: activeEventId }
    setFighters((prev) => [...prev, newFighter])
  }

  function createEvent(name, matchlistUrl) {
    const trimmed = (name || '').trim()
    const url = (matchlistUrl || '').trim()
    if (!trimmed) return
    const newEvent = { id: crypto.randomUUID(), name: trimmed, matchlistUrl: url }
    setEvents((prev) => [...prev, newEvent])
    setActiveEventId(newEvent.id)
    setMatchMap({})
    setUrgentIds(new Set())
  }

  function renameEvent(id, name) {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, name: trimmed } : e)))
  }

  function deleteEvent(id) {
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    if (!window.confirm(`¿Eliminar el evento «${ev.name}» y todos sus luchadores?`)) return
    setFighters((prev) => prev.filter((f) => f.eventId !== id))
    setMatchMap((prev) => {
      const next = { ...prev }
      for (const f of fighters) if (f.eventId === id) delete next[f.id]
      return next
    })
    setEvents((prev) => {
      const remaining = prev.filter((e) => e.id !== id)
      // No phantom "Evento 1": deleting the last event returns to the empty state.
      if (remaining.length === 0) {
        setActiveEventId(null)
        return []
      }
      if (id === activeEventId) setActiveEventId(remaining[0].id)
      return remaining
    })
    setUrgentIds(new Set())
  }

  function selectEvent(id) {
    if (id === activeEventId) return
    setActiveEventId(id)
    setMatchMap({})
    setUrgentIds(new Set())
    setLastUpdated(null)
  }

  function removeFighter(id) {
    setFighters((prev) => prev.filter((f) => f.id !== id))
    setMatchMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function handleScanResult(data) {
    setShowScanner(false)
    try {
      const url = new URL(data)
      const decoded = decodeImportParam(url.searchParams)
      if (!decoded) return
      importDecoded(decoded)
    } catch {
      alert('QR inválido o no reconocido.')
    }
  }

  function handlePasteImport(text) {
    try {
      const urlObj = new URL(text.trim())
      const decoded = decodeImportParam(urlObj.searchParams)
      if (!decoded) { alert('El enlace no contiene datos de importación.'); return 0 }
      return importDecoded(decoded)
    } catch {
      alert('Enlace inválido.')
      return 0
    }
  }

  function handleManualRefresh() {
    refresh()
  }

  async function activateServerMonitoring() {
    if (!activeFighters.length) return alert('No hay luchadores en este evento.')
    if (!emailConfig.serviceId) return alert('Configura las notificaciones de email primero.')
    const ev = events.find((e) => e.id === activeEventId)
    const eventUrl = ev?.matchlistUrl || ''
    if (!eventUrl) return alert('Este evento no tiene una match list configurada.')
    // Server cron / api/watch read `url` per fighter — inject the event's URL.
    const payloadFighters = activeFighters.map((f) => ({ ...f, url: eventUrl, matchlistUrl: eventUrl, bracketUrl: eventUrl }))
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fighters: payloadFighters, emailConfig }),
      })
      const data = await res.json()
      if (data.ok) setSuccessInfo({ eventName: ev?.name || '', count: data.count })
      else alert('Error al activar: ' + data.error)
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    }
  }

  const activeEvent = events.find((e) => e.id === activeEventId) || null
  const isMonitoring = activeFighters.length > 0
  const showSlowNotice = isLoading && activeFighters.length >= 6

  // Sort fighters by next match time (earliest first, no-time goes to bottom)
  const sortedFighters = [...activeFighters].sort((a, b) => {
    const dA = matchMap[a.id]
    const dB = matchMap[b.id]
    const liveA = dA?.status === 'live' ? 0 : 1
    const liveB = dB?.status === 'live' ? 0 : 1
    if (liveA !== liveB) return liveA - liveB  // live always first
    const tA = dA?.time
    const tB = dB?.time
    if (tA && tB) return tA.localeCompare(tB) || a.name.localeCompare(b.name)
    if (tA) return -1
    if (tB) return 1
    return a.name.localeCompare(b.name)
  })

  if (checking) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-title">COMBAT FOLLOW</div>
          <p className="login-text">Cargando…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen onCredential={signIn} error={authError} />
  }

  if (status !== 'approved') {
    return <StatusScreen status={status} user={user} onSignOut={signOut} />
  }

  return (
    <>
      <Header
        isMonitoring={isMonitoring}
        lastUpdated={lastUpdated}
        onRefresh={handleManualRefresh}
        isLoading={isLoading}
        user={user}
        onSignOut={signOut}
        onOpenNotifications={() => setShowNotifications(true)}
      />

      {tab === 'admin' && isAdmin && (
        <AdminPanel credential={credential} adminEmail={user.email} />
      )}

      {tab === 'setup' && (
        <SetupPanel
          fighters={activeFighters}
          events={events}
          activeEventId={activeEventId}
          onSelectEvent={selectEvent}
          onCreateEvent={createEvent}
          onRenameEvent={renameEvent}
          onDeleteEvent={deleteEvent}
          onAdd={addFighter}
          onRemove={removeFighter}
          onEdit={editFighter}
          onClearAll={clearAllFighters}
          onShowQR={() => setShowQR(true)}
          onShowScanner={() => setShowScanner(true)}
          onPasteImport={handlePasteImport}
        />
      )}

      {tab === 'panel' && (
        <div className="panel-screen">
          {events.length > 1 && (
            <div className="event-chips" style={{ padding: '12px 16px 0' }}>
              {events.map((ev) => (
                <button
                  key={ev.id}
                  className={`event-chip${ev.id === activeEventId ? ' active' : ''}`}
                  onClick={() => selectEvent(ev.id)}
                >
                  {ev.name}
                </button>
              ))}
            </div>
          )}
          <div className="panel-toolbar">
            <label>Actualizar cada:</label>
            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
            <div className="spacer" />
            {activeFighters.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 12, minHeight: 32, gap: 6 }} onClick={activateServerMonitoring}>
                <IconGear size={14} />
                Servidor
              </button>
            )}
          </div>

          {showSlowNotice && (
            <div className="slow-notice">
              ⚠ La revisión puede tardar unos segundos
            </div>
          )}

          {activeFighters.length === 0 ? (
            <div className="empty-state">
              <h2>Sin luchadores{activeEvent ? ` en «${activeEvent.name}»` : ''}</h2>
              <p>Agrega luchadores en la pestaña Setup para comenzar a monitorear.</p>
              <button className="btn-primary" onClick={() => setTab('setup')}>
                Ir a Setup
              </button>
            </div>
          ) : (
            <div className="cards-scroll">
              <div className={`cards-grid ${gridClass(activeFighters.length)}`}>
                {sortedFighters.map((fighter) => (
                  <FighterCard
                    key={fighter.id}
                    fighter={fighter}
                    matchData={matchMap[fighter.id] ?? null}
                    isLoading={isLoading && !matchMap[fighter.id]}
                    isChanged={false}
                    isUrgent={urgentIds.has(fighter.id)}
                    onNoteChange={(note) => updateNote(fighter.id, note)}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      <nav className="tabbar">
        <button className={`tab${tab === 'panel' ? ' active' : ''}`} onClick={() => setTab('panel')}>
          <IconPanel />
          Panel
        </button>
        <button className={`tab${tab === 'setup' ? ' active' : ''}`} onClick={() => setTab('setup')}>
          <IconSetup />
          Setup
        </button>
        <button className="fab" onClick={() => setTab('setup')} aria-label="Agregar seguimiento">
          <IconPlus />
        </button>
        {isAdmin && (
          <button className={`tab${tab === 'admin' ? ' active' : ''}`} onClick={() => setTab('admin')}>
            <IconAdmin />
            Admin
          </button>
        )}
      </nav>

      {showQR && (
        <QRModal fighters={activeFighters} eventName={activeEvent?.name} eventUrl={activeEvent?.matchlistUrl} emailConfig={emailConfig} onClose={() => setShowQR(false)} />
      )}
      {showScanner && (
        <QRScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      )}
      {successInfo && (
        <SuccessOverlay
          eventName={successInfo.eventName}
          count={successInfo.count}
          onClose={() => setSuccessInfo(null)}
        />
      )}
      {showNotifications && (
        <NotificationsModal
          emailConfig={emailConfig}
          onSave={saveEmailConfig}
          onClose={() => setShowNotifications(false)}
        />
      )}
    </>
  )
}
