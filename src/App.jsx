import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header'
import SetupPanel from './components/SetupPanel'
import FighterCard from './components/FighterCard'
import { scrapeAllFighters } from './api/scrape'
import { sendChangeAlert } from './api/email'
import QRModal from './components/QRModal'
import QRScanner from './components/QRScanner'

const STORAGE_KEY = 'combat-follow-fighters'
const EMAIL_CONFIG_KEY = 'combat-follow-email'

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

export default function App() {
  const [tab, setTab] = useState('panel')
  const [fighters, setFighters] = useState(loadFighters)
  const [matchMap, setMatchMap] = useState({})
  const [urgentIds, setUrgentIds] = useState(new Set())
  const [notifiedIds, setNotifiedIds] = useState(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalSec, setIntervalSec] = useState(120)
  const [emailConfig, setEmailConfig] = useState(loadEmailConfig)
  const [showQR, setShowQR] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const intervalRef = useRef(null)
  const prevMatchRef = useRef({})

  useEffect(() => {
    saveFighters(fighters)
  }, [fighters])

  const refresh = useCallback(async () => {
    if (fighters.length === 0) return
    if (isLoading) return  // debounce — ignore if already running
    setIsLoading(true)
    try {
      const results = await scrapeAllFighters(fighters)
      const now = new Date()

      const newUrgentIds = new Set()

      setMatchMap((prev) => {
        const next = { ...prev }
        results.forEach(({ id, data, error }) => {
          if (error) { next[id] = { status: 'error', message: error }; return }
          next[id] = data
        })
        prevMatchRef.current = { ...next }
        return next
      })

      // Check for fighters with <10 min until fight — alert once per fight
      results.forEach(({ id, data }) => {
        if (!data?.time || data.status === 'notfound') return
        const mins = minutesUntil(data.time)
        if (mins !== null && mins >= 0 && mins < 10) {
          newUrgentIds.add(id)
          // Send email only once per fight (track by id+fight ref)
          const alertKey = `${id}-${data.fight || data.time}`
          setNotifiedIds((prev) => {
            if (prev.has(alertKey)) return prev
            const fighter = fighters.find((f) => f.id === id)
            vibrate()
            sendChangeAlert({
              config: emailConfig,
              fighter: fighter?.name || id,
              changes: [{ field: '⚡ COMBATE EN MENOS DE 10 MIN', from: `Mat ${data.mat} · Fight ${data.fight}`, to: data.time }],
            })
            return new Set([...prev, alertKey])
          })
        }
      })

      setUrgentIds(newUrgentIds)
      setLastUpdated(now)
    } catch (err) {
      console.error('Refresh error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [fighters])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (fighters.length === 0) return
    intervalRef.current = setInterval(refresh, intervalSec * 1000)
    return () => clearInterval(intervalRef.current)
  }, [refresh, intervalSec, fighters.length])

  // On load: check for ?import= param and merge fighters from QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const importParam = params.get('import')
    if (importParam) {
      try {
        const decoded = JSON.parse(decodeURIComponent(escape(atob(importParam))))
        // Support both old format (array) and new format ({ fighters, email })
        const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
        const importedEmail = !Array.isArray(decoded) ? decoded.email : null

        if (importedFighters.length > 0) {
          const newFighters = importedFighters.map((f) => ({ ...f, id: crypto.randomUUID() }))
          setFighters((prev) => {
            const existingUrls = new Set(prev.map((f) => f.bracketUrl))
            const toAdd = newFighters.filter((f) => !existingUrls.has(f.bracketUrl))
            return [...prev, ...toAdd]
          })
        }
        if (importedEmail && importedEmail.serviceId) {
          setEmailConfig(importedEmail)
          localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(importedEmail))
        }
      } catch { /* ignore bad param */ }
      // Clean the URL without reloading
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (fighters.length > 0) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function clearAllFighters() {
    if (!window.confirm('¿Eliminar todos los luchadores?')) return
    setFighters([])
    setMatchMap({})
    setUrgentIds(new Set())
    setNotifiedIds(new Set())
  }

  function editFighter(id, updates) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, ...updates } : f))
  }

  function updateNote(id, note) {
    setFighters((prev) => prev.map((f) => f.id === id ? { ...f, note } : f))
  }

  function addFighter(fighter) {
    const newFighter = { ...fighter, id: crypto.randomUUID() }
    setFighters((prev) => [...prev, newFighter])
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
      // Extract ?import= param from scanned URL
      const url = new URL(data)
      const importParam = url.searchParams.get('import')
      if (!importParam) return
      const decoded = JSON.parse(decodeURIComponent(escape(atob(importParam))))
      const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
      const importedEmail = !Array.isArray(decoded) ? decoded.email : null
      if (importedFighters.length > 0) {
        const newFighters = importedFighters.map((f) => ({ ...f, id: crypto.randomUUID() }))
        setFighters((prev) => {
          const existingUrls = new Set(prev.map((f) => f.bracketUrl))
          const toAdd = newFighters.filter((f) => !existingUrls.has(f.bracketUrl))
          return [...prev, ...toAdd]
        })
      }
      if (importedEmail?.serviceId) {
        setEmailConfig(importedEmail)
        localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(importedEmail))
      }
    } catch {
      alert('QR inválido o no reconocido.')
    }
  }

  function handleManualRefresh() {
    refresh()
  }

  async function activateServerMonitoring() {
    if (!fighters.length) return alert('No hay luchadores configurados.')
    if (!emailConfig.serviceId) return alert('Configura las notificaciones de email primero.')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fighters, emailConfig }),
      })
      const data = await res.json()
      if (data.ok) alert(`✅ Monitoreo activado para ${data.count} luchadores.\n\nEl servidor revisará los horarios cada 2 minutos y te enviará un email si hay cambios.`)
      else alert('Error al activar: ' + data.error)
    } catch (e) {
      alert('Error de conexión: ' + e.message)
    }
  }

  const isMonitoring = fighters.length > 0
  const showSlowNotice = isLoading && fighters.length >= 6

  // Sort fighters by next match time (earliest first, no-time goes to bottom)
  const sortedFighters = [...fighters].sort((a, b) => {
    const tA = matchMap[a.id]?.time
    const tB = matchMap[b.id]?.time
    if (tA && tB) return tA.localeCompare(tB)
    if (tA) return -1
    if (tB) return 1
    return 0
  })

  return (
    <>
      <Header
        isMonitoring={isMonitoring}
        lastUpdated={lastUpdated}
        onRefresh={handleManualRefresh}
        isLoading={isLoading}
      />

      <nav className="nav-tabs">
        <button
          className={`nav-tab${tab === 'panel' ? ' active' : ''}`}
          onClick={() => setTab('panel')}
        >
          Panel
        </button>
        <button
          className={`nav-tab${tab === 'setup' ? ' active' : ''}`}
          onClick={() => setTab('setup')}
        >
          Setup {fighters.length > 0 && `(${fighters.length})`}
        </button>
      </nav>

      {tab === 'setup' && (
        <SetupPanel
          fighters={fighters}
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
        />
      )}

      {tab === 'panel' && (
        <div className="panel-screen">
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
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ fontSize: 11, minHeight: 32 }} onClick={activateServerMonitoring}>
                ⚙ Servidor
              </button>
            )}
          </div>

          {showSlowNotice && (
            <div className="slow-notice">
              ⚠ La revisión puede tardar unos segundos
            </div>
          )}

          {fighters.length === 0 ? (
            <div className="empty-state">
              <h2>Sin luchadores</h2>
              <p>Agrega luchadores en la pestaña Setup para comenzar a monitorear.</p>
              <button className="btn-primary" onClick={() => setTab('setup')}>
                Ir a Setup
              </button>
            </div>
          ) : (
            <div className="cards-scroll">
              <div className={`cards-grid ${gridClass(fighters.length)}`}>
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

      {showQR && (
        <QRModal fighters={fighters} emailConfig={emailConfig} onClose={() => setShowQR(false)} />
      )}
      {showScanner && (
        <QRScanner onResult={handleScanResult} onClose={() => setShowScanner(false)} />
      )}
    </>
  )
}
