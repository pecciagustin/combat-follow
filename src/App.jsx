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
import { IconGear } from './components/icons'
import { useAuth } from './auth/useAuth'

const STORAGE_KEY = 'combat-follow-fighters'
const EMAIL_CONFIG_KEY = 'combat-follow-email'
const EVENTS_KEY = 'combat-follow-events'
const ACTIVE_EVENT_KEY = 'combat-follow-active-event'

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

// Ensure there is always at least one event and every fighter is tagged with an
// eventId. Migrates legacy data (flat fighter list, no events) into a default
// event. Returns { events, fighters, activeEventId } — possibly unchanged.
function migrateEvents(events, fighters, activeEventId) {
  let nextEvents = events
  let nextFighters = fighters

  if (nextEvents.length === 0) {
    const hadFighters = nextFighters.length > 0
    const defaultEvent = { id: crypto.randomUUID(), name: hadFighters ? 'Mi evento' : 'Evento 1' }
    nextEvents = [defaultEvent]
    // Attach any untagged fighters to the default event.
    nextFighters = nextFighters.map((f) => (f.eventId ? f : { ...f, eventId: defaultEvent.id }))
    activeEventId = defaultEvent.id
  } else {
    // Tag any fighters missing an eventId (or pointing to a deleted event).
    const validIds = new Set(nextEvents.map((e) => e.id))
    const fallbackId = nextEvents[0].id
    nextFighters = nextFighters.map((f) =>
      validIds.has(f.eventId) ? f : { ...f, eventId: fallbackId }
    )
  }

  if (!activeEventId || !nextEvents.some((e) => e.id === activeEventId)) {
    activeEventId = nextEvents[0].id
  }

  return { events: nextEvents, fighters: nextFighters, activeEventId }
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
  // Run migration once so events/fighters/active id are consistent from render 1.
  const [seed] = useState(() => migrateEvents(loadEvents(), loadFighters(), loadActiveEventId()))
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
  }, [activeEventId])

  // Fighters belonging to the currently selected event.
  const activeFighters = fighters.filter((f) => f.eventId === activeEventId)

  const refresh = useCallback(async () => {
    // Only refresh the fighters of the active event.
    const toScrape = fighters.filter((f) => f.eventId === activeEventId)
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
  }, [fighters, activeEventId])

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

    // Resolve the target event.
    let targetId = activeEventId
    if (eventName) {
      const existing = events.find((e) => e.name.toLowerCase() === eventName.toLowerCase())
      if (existing) {
        targetId = existing.id
      } else {
        const newEvent = { id: crypto.randomUUID(), name: eventName }
        targetId = newEvent.id
        setEvents((prev) => [...prev, newEvent])
      }
      setActiveEventId(targetId)
    }

    const fighterKey = (f) => f.trackMode === 'fight'
      ? `fight:${f.matchlistUrl}:${f.mat}:${f.fightNum}`
      : f.bracketUrl
    const existingKeys = new Set(
      fighters.filter((f) => f.eventId === targetId).map(fighterKey)
    )
    const toAdd = importedFighters
      .filter((f) => !existingKeys.has(fighterKey(f)))
      .map((f) => ({ ...f, id: crypto.randomUUID(), eventId: targetId }))
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
    const newFighter = { ...fighter, id: crypto.randomUUID(), eventId: activeEventId }
    setFighters((prev) => [...prev, newFighter])
  }

  function createEvent(name) {
    const trimmed = (name || '').trim()
    if (!trimmed) return
    const newEvent = { id: crypto.randomUUID(), name: trimmed }
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
      if (remaining.length === 0) {
        const fresh = { id: crypto.randomUUID(), name: 'Evento 1' }
        setActiveEventId(fresh.id)
        return [fresh]
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
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fighters: activeFighters, emailConfig }),
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
          emailConfig={emailConfig}
          onEmailConfig={(cfg) => {
            setEmailConfig(cfg)
            localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(cfg))
          }}
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
        <QRModal fighters={activeFighters} eventName={activeEvent?.name} emailConfig={emailConfig} onClose={() => setShowQR(false)} />
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
    </>
  )
}
