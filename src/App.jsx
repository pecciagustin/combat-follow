import { useState, useEffect, useRef, useCallback } from 'react'
import LZString from 'lz-string'
import Header from './components/Header'
import SetupPanel from './components/SetupPanel'
import FighterCard from './components/FighterCard'
import { scrapeAllFighters } from './api/scrape'
import QRModal from './components/QRModal'
import QRScanner from './components/QRScanner'

const STORAGE_KEY = 'combat-follow-fighters'
const EMAIL_CONFIG_KEY = 'combat-follow-email'

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
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalSec, setIntervalSec] = useState(120)
  const [emailConfig, setEmailConfig] = useState(loadEmailConfig)
  const [showQR, setShowQR] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const intervalRef = useRef(null)
  const isLoadingRef = useRef(false) // ref-based lock — never stale in closures

  useEffect(() => {
    saveFighters(fighters)
  }, [fighters])

  const refresh = useCallback(async () => {
    if (fighters.length === 0) return
    if (isLoadingRef.current) return  // debounce — reliable ref, never stale
    isLoadingRef.current = true
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
  }, [fighters])

  useEffect(() => {
    clearInterval(intervalRef.current)
    if (fighters.length === 0) return
    intervalRef.current = setInterval(refresh, intervalSec * 1000)
    return () => clearInterval(intervalRef.current)
  }, [refresh, intervalSec, fighters.length])

  // On load: check for ?import= / ?importz= param and merge fighters from QR
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('import') || params.get('importz')) {
      try {
        const decoded = decodeImportParam(params)
        // Support both old format (array) and new format ({ fighters, email })
        const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
        const importedEmail = !Array.isArray(decoded) ? decoded.email : null

        if (importedFighters.length > 0) {
          const newFighters = importedFighters.map((f) => ({ ...f, id: crypto.randomUUID() }))
          setFighters((prev) => {
            const fighterKey = f => f.trackMode === 'fight'
              ? `fight:${f.matchlistUrl}:${f.mat}:${f.fightNum}`
              : f.bracketUrl
            const existingKeys = new Set(prev.map(fighterKey))
            const toAdd = newFighters.filter((f) => !existingKeys.has(fighterKey(f)))
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
      const url = new URL(data)
      const decoded = decodeImportParam(url.searchParams)
      if (!decoded) return
      const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
      const importedEmail = !Array.isArray(decoded) ? decoded.email : null
      if (importedFighters.length > 0) {
        const newFighters = importedFighters.map((f) => ({ ...f, id: crypto.randomUUID() }))
        setFighters((prev) => {
          const fighterKey = f => f.trackMode === 'fight'
            ? `fight:${f.matchlistUrl}:${f.mat}:${f.fightNum}`
            : f.bracketUrl
          const existingKeys = new Set(prev.map(fighterKey))
          const toAdd = newFighters.filter((f) => !existingKeys.has(fighterKey(f)))
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

  function handlePasteImport(text) {
    try {
      const urlObj = new URL(text.trim())
      const decoded = decodeImportParam(urlObj.searchParams)
      if (!decoded) { alert('El enlace no contiene datos de importación.'); return }
      const importedFighters = Array.isArray(decoded) ? decoded : decoded.fighters || []
      const importedEmail = !Array.isArray(decoded) ? decoded.email : null
      if (importedFighters.length > 0) {
        const newFighters = importedFighters.map((f) => ({ ...f, id: crypto.randomUUID() }))
        setFighters((prev) => {
          const fighterKey = f => f.trackMode === 'fight'
            ? `fight:${f.matchlistUrl}:${f.mat}:${f.fightNum}`
            : f.bracketUrl
          const existingKeys = new Set(prev.map(fighterKey))
          const toAdd = newFighters.filter((f) => !existingKeys.has(fighterKey(f)))
          return [...prev, ...toAdd]
        })
      }
      if (importedEmail?.serviceId) {
        setEmailConfig(importedEmail)
        localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(importedEmail))
      }
      return importedFighters.length
    } catch {
      alert('Enlace inválido.')
      return 0
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
          onPasteImport={handlePasteImport}
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
