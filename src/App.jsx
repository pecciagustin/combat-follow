import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './components/Header'
import SetupPanel from './components/SetupPanel'
import FighterCard from './components/FighterCard'
import ChangeLog from './components/ChangeLog'
import { scrapeAllFighters } from './api/scrape'

const STORAGE_KEY = 'combat-follow-fighters'
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
  const [changedIds, setChangedIds] = useState(new Set())
  const [changelog, setChangelog] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalSec, setIntervalSec] = useState(120)
  const intervalRef = useRef(null)
  const prevMatchRef = useRef({})

  useEffect(() => {
    saveFighters(fighters)
  }, [fighters])

  const refresh = useCallback(async () => {
    if (fighters.length === 0) return
    setIsLoading(true)
    try {
      const results = await scrapeAllFighters(fighters)
      const now = new Date()
      const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const newChangedIds = new Set()
      const newEntries = []

      setMatchMap((prev) => {
        const next = { ...prev }
        results.forEach(({ id, data, error }) => {
          if (error) {
            next[id] = { status: 'error', message: error }
            return
          }
          next[id] = data
          const old = prevMatchRef.current[id]
          if (old && data && data.status !== 'notfound') {
            const fighter = fighters.find((f) => f.id === id)
            const name = fighter?.name || id
            if (old.time && data.time && old.time !== data.time) {
              newChangedIds.add(id)
              newEntries.push({ fighter: name, field: 'Hora', from: old.time, to: data.time, timestamp: nowStr })
            }
            if (old.mat && data.mat && old.mat !== data.mat) {
              newChangedIds.add(id)
              newEntries.push({ fighter: name, field: 'Mat', from: old.mat, to: data.mat, timestamp: nowStr })
            }
          }
        })
        prevMatchRef.current = { ...next }
        return next
      })

      if (newChangedIds.size > 0) {
        setChangedIds((prev) => new Set([...prev, ...newChangedIds]))
        setChangelog((prev) => [...prev, ...newEntries])
      }

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

  useEffect(() => {
    if (fighters.length > 0) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    setChangedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function handleManualRefresh() {
    setChangedIds(new Set())
    refresh()
  }

  const isMonitoring = fighters.length > 0
  const showSlowNotice = fighters.length >= 6

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
        <SetupPanel fighters={fighters} onAdd={addFighter} onRemove={removeFighter} />
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
                {fighters.map((fighter) => (
                  <FighterCard
                    key={fighter.id}
                    fighter={fighter}
                    matchData={matchMap[fighter.id] ?? null}
                    isLoading={isLoading && !matchMap[fighter.id]}
                    isChanged={changedIds.has(fighter.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <ChangeLog entries={changelog} />
        </div>
      )}
    </>
  )
}
