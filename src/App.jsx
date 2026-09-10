import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import MyTournamentsModal from './components/MyTournamentsModal'
import { IconGear } from './components/icons'
import { saveTournaments } from './api/tournaments'
import { listFighters, addFighterRemote, removeFighterRemote, migrateFighters } from './api/fighters'
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

// Mirror of the server rule: within each event, the first `max` fighters ordered
// by addedAt (insertion order as tiebreak) are ACTIVE; the rest are read-only
// excess. Returns the Set of active fighter ids. `max` may be Infinity (no cap).
function computeActiveIds(fighters, max) {
  const byEvent = new Map()
  fighters.forEach((f, i) => {
    if (!byEvent.has(f.eventId)) byEvent.set(f.eventId, [])
    byEvent.get(f.eventId).push({ f, i })
  })
  const set = new Set()
  for (const list of byEvent.values()) {
    list.sort((a, b) => (a.f.addedAt || 0) - (b.f.addedAt || 0) || a.i - b.i)
    list.slice(0, max).forEach(({ f }) => set.add(f.id))
  }
  return set
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
  const {
    user, status, isAdmin, credential, checking, error: authError, signIn, signOut,
    tier, maxFighters,
  } = useAuth()
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
  const [showMyTournaments, setShowMyTournaments] = useState(false)

  function saveEmailConfig(cfg) {
    setEmailConfig(cfg)
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(cfg))
  }
  const intervalRef = useRef(null)
  const isLoadingRef = useRef(false) // ref-based lock — never stale in closures
  const reconciledRef = useRef(false) // one-time roster reconcile with the server

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

  // Sync each event (with its fighters) to the user's account archive, debounced.
  // Upsert-only on the server, so deleting an event locally keeps it in "Mis
  // torneos". No-op when logged out / dev bypass (no credential); errors ignored.
  useEffect(() => {
    if (!credential || events.length === 0) return
    const t = setTimeout(() => {
      const snapshots = events.map((ev) => ({
        id: ev.id,
        name: ev.name,
        matchlistUrl: ev.matchlistUrl || '',
        updatedAt: Date.now(),
        fighters: fighters
          .filter((f) => f.eventId === ev.id)
          .map(({ name, discipline, trackMode, mat, fightNum }) => ({
            name,
            ...(discipline ? { discipline } : {}),
            ...(trackMode === 'fight' ? { trackMode, mat, fightNum } : {}),
          })),
      }))
      saveTournaments(credential, snapshots).catch(() => { /* offline / not deployed — ignore */ })
    }, 1500)
    return () => clearTimeout(t)
  }, [credential, events, fighters])

  // Reconcile the local roster with the authoritative server roster once per
  // load. The server wins on membership + `active`. If the server has nothing
  // yet but we have local fighters, seed it (one-time migration per event),
  // preserving local ids so matchMap/notes stay attached.
  useEffect(() => {
    if (!credential || reconciledRef.current) return
    reconciledRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        let { fighters: serverFighters } = await listFighters(credential)
        const local = loadFighters()
        if (serverFighters.length === 0 && local.length > 0) {
          await migrateFighters(credential, local)
          ;({ fighters: serverFighters } = await listFighters(credential))
        }
        if (cancelled || serverFighters.length === 0) return
        setFighters((prev) => {
          const noteById = new Map(prev.map((f) => [f.id, f.note]))
          return serverFighters.map((sf) => ({
            ...sf,
            note: sf.note ?? noteById.get(sf.id) ?? undefined,
          }))
        })
      } catch {
        // Offline / not deployed → keep working from localStorage.
        reconciledRef.current = false
      }
    })()
    return () => { cancelled = true }
  }, [credential])

  // Per-event quota. null (logged out / dev without server) → no cap enforced here.
  const effectiveMax = Number.isFinite(maxFighters) ? maxFighters : Infinity
  // Active set mirrors the server: excess (read-only) fighters are active:false.
  const activeIds = useMemo(() => computeActiveIds(fighters, effectiveMax), [fighters, effectiveMax])

  // Fighters of the selected event (Setup shows all, tagged with `active`).
  const activeFighters = fighters
    .filter((f) => f.eventId === activeEventId)
    .map((f) => ({ ...f, active: activeIds.has(f.id) }))
  // Only active fighters are tracked (panel, refresh, monitoring, sharing).
  const trackedFighters = activeFighters.filter((f) => f.active)
  const usedCount = trackedFighters.length

  const refresh = useCallback(async () => {
    // Only refresh the fighters of the active event, injecting the event's
    // match list URL into each one (fighters no longer carry their own URL).
    const ev = events.find((e) => e.id === activeEventId)
    const eventUrl = ev?.matchlistUrl || ''
    if (!eventUrl) return
    const toScrape = fighters
      .filter((f) => f.eventId === activeEventId && activeIds.has(f.id))
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
  }, [fighters, events, activeEventId, activeIds])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (trackedFighters.length === 0) return
    intervalRef.current = setInterval(refresh, intervalSec * 1000)
    return () => clearInterval(intervalRef.current)
  }, [refresh, intervalSec, trackedFighters.length])

  // Import fighters from a decoded payload (array | { fighters, email, eventName }).
  // If the payload names an event, import into that event (creating it if needed)
  // and make it active; otherwise import into the current active event.
  // Dedupe is scoped to the target event. Returns the number of fighters added.
  // Add a fighter to a given event through the server (the quota is enforced
  // there). Returns { ok } or { ok:false, code:'LIMIT_REACHED', used, max }.
  // Without a credential (dev bypass / offline) it falls back to local-only.
  const addFighterToEvent = useCallback(async (eventId, core) => {
    if (!eventId) return { ok: false }
    if (!credential) {
      const local = { ...core, id: crypto.randomUUID(), eventId, addedAt: Date.now() }
      setFighters((prev) => [...prev, local])
      return { ok: true }
    }
    try {
      const created = await addFighterRemote(credential, eventId, core)
      setFighters((prev) => [...prev, created])
      return { ok: true }
    } catch (e) {
      if (e.code === 'LIMIT_REACHED') return { ok: false, code: 'LIMIT_REACHED', used: e.used, max: e.max }
      return { ok: false, error: e.message }
    }
  }, [credential])

  const importDecoded = useCallback(async (decoded) => {
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
    const cores = importedFighters
      .filter((f) => !existingKeys.has(fighterKey(f)))
      .map((f) => {
        // Keep only the new model's fields; drop any per-fighter URL.
        if (f.trackMode === 'fight') return { trackMode: 'fight', name: f.name, mat: f.mat, fightNum: f.fightNum }
        return { name: f.name, discipline: f.discipline || null }
      })

    // Route each import through the server so the per-event quota is enforced;
    // stop counting once the plan is full (extras are simply not added).
    let added = 0
    let hitLimit = false
    for (const core of cores) {
      const res = await addFighterToEvent(targetId, core)
      if (res.ok) added++
      else if (res.code === 'LIMIT_REACHED') { hitLimit = true; break }
    }
    if (hitLimit) {
      alert('Algunos seguimientos no se importaron: alcanzaste el límite de tu plan para este evento.')
    }

    if (importedEmail?.serviceId) {
      setEmailConfig(importedEmail)
      localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(importedEmail))
    }
    return added
  }, [activeEventId, events, fighters, addFighterToEvent])

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
    const removedIds = fighters.filter((f) => f.eventId === activeEventId).map((f) => f.id)
    setFighters((prev) => prev.filter((f) => f.eventId !== activeEventId))
    setMatchMap((prev) => {
      const next = { ...prev }
      for (const f of fighters) if (f.eventId === activeEventId) delete next[f.id]
      return next
    })
    setUrgentIds(new Set())
    if (credential) for (const id of removedIds) removeFighterRemote(credential, id).catch(() => {})
  }

  function editFighter(id, updates) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f))
  }

  function updateNote(id, note) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, note } : f))
  }

  async function addFighter(fighter) {
    if (!activeEventId) return  // no active event → nothing to attach to
    const res = await addFighterToEvent(activeEventId, fighter)
    if (!res.ok && res.code === 'LIMIT_REACHED') {
      alert(`Alcanzaste el límite de tu plan (${res.max} por evento). Elimina un seguimiento para agregar otro.`)
    }
    return res
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
    const removedIds = fighters.filter((f) => f.eventId === id).map((f) => f.id)
    setFighters((prev) => prev.filter((f) => f.eventId !== id))
    setMatchMap((prev) => {
      const next = { ...prev }
      for (const f of fighters) if (f.eventId === id) delete next[f.id]
      return next
    })
    if (credential) for (const rid of removedIds) removeFighterRemote(credential, rid).catch(() => {})
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
    if (credential) removeFighterRemote(credential, id).catch(() => { /* best effort */ })
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
    if (!trackedFighters.length) return alert('No hay luchadores en este evento.')
    if (!emailConfig.serviceId) return alert('Configura las notificaciones de email primero.')
    const ev = events.find((e) => e.id === activeEventId)
    const eventUrl = ev?.matchlistUrl || ''
    if (!eventUrl) return alert('Este evento no tiene una match list configurada.')
    // Server cron / api/watch read `url` per fighter — inject the event's URL.
    const payloadFighters = trackedFighters.map((f) => ({ ...f, url: eventUrl, matchlistUrl: eventUrl, bracketUrl: eventUrl }))
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, fighters: payloadFighters, emailConfig }),
      })
      const data = await res.json()
      if (data.ok) setSuccessInfo({ eventName: ev?.name || '', count: data.count })
      else alert('Error al activar: ' + data.error)
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    }
  }

  const activeEvent = events.find((e) => e.id === activeEventId) || null
  const isMonitoring = trackedFighters.length > 0
  const showSlowNotice = isLoading && trackedFighters.length >= 6

  // Sort fighters by next match time (earliest first, no-time goes to bottom)
  const sortedFighters = [...trackedFighters].sort((a, b) => {
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
    return (
      <StatusScreen
        status={status}
        user={user}
        onSignOut={signOut}
      />
    )
  }

  return (
    <>
      <Header
        isMonitoring={isMonitoring}
        lastUpdated={lastUpdated}
        onRefresh={handleManualRefresh}
        isLoading={isLoading}
        user={user}
        isAdmin={isAdmin}
        onSignOut={signOut}
        onOpenNotifications={() => setShowNotifications(true)}
        onOpenMyTournaments={() => setShowMyTournaments(true)}
      />

      {tab === 'admin' && isAdmin && (
        <AdminPanel credential={credential} adminEmail={user.email} />
      )}

      {tab === 'setup' && (
        <SetupPanel
          fighters={activeFighters}
          events={events}
          activeEventId={activeEventId}
          maxFighters={effectiveMax === Infinity ? null : effectiveMax}
          usedCount={usedCount}
          tier={tier}
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
            {isAdmin && trackedFighters.length > 0 && (
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

          {trackedFighters.length === 0 ? (
            <div className="empty-state">
              <h2>Sin luchadores{activeEvent ? ` en «${activeEvent.name}»` : ''}</h2>
              <p>Agrega luchadores en la pestaña Setup para comenzar a monitorear.</p>
              <button className="btn-primary" onClick={() => setTab('setup')}>
                Ir a Setup
              </button>
            </div>
          ) : (
            <div className="cards-scroll">
              <div className={`cards-grid ${gridClass(trackedFighters.length)}`}>
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
        <QRModal fighters={trackedFighters} eventName={activeEvent?.name} eventUrl={activeEvent?.matchlistUrl} emailConfig={emailConfig} onClose={() => setShowQR(false)} />
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
      {showMyTournaments && (
        <MyTournamentsModal
          credential={credential}
          onClose={() => setShowMyTournaments(false)}
        />
      )}
    </>
  )
}
