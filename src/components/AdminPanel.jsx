import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../auth/googleAuth'

const STATUS_LABEL = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  blocked: 'Bloqueado',
}

const TIERS = ['fighter', 'team', 'official']
const TIER_LABEL = { fighter: 'Fighter', team: 'Team', official: 'Official' }
const TIER_DEFAULT_MAX = { fighter: 1, team: 15, official: 100000 }

function fmtDate(ms) {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString([], {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

// Inline tier / quota / features editor for one user. Callable any time.
function TierEditor({ user, credential, onSaved }) {
  const [tier, setTier] = useState(user.tier || 'fighter')
  const [max, setMax] = useState(user.maxFighters ?? TIER_DEFAULT_MAX[user.tier || 'fighter'])
  const [realtime, setRealtime] = useState(user.features?.realtimeAlerts === true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // When the tier changes, prefill the quota with that tier's default.
  function changeTier(next) {
    setTier(next)
    setMax(TIER_DEFAULT_MAX[next])
  }

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await adminApi(credential, 'setUserTier', {
        email: user.email,
        tier,
        maxFighters: Number(max),
        features: { realtimeAlerts: realtime },
      })
      setMsg('✓ Guardado')
      onSaved?.(user.email, { tier, maxFighters: Number(max), features: { realtimeAlerts: realtime } })
      setTimeout(() => setMsg(''), 2000)
    } catch (e) {
      setMsg(e.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tier-editor">
      <select value={tier} onChange={(e) => changeTier(e.target.value)} disabled={busy}>
        {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
      </select>
      <input
        type="number"
        min="0"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        disabled={busy}
        aria-label="Cupo de peleadores"
        title="Cupo de peleadores por evento"
      />
      <label className="tier-feature">
        <input type="checkbox" checked={realtime} onChange={(e) => setRealtime(e.target.checked)} disabled={busy} />
        Alertas
      </label>
      <button className="btn-approve" onClick={save} disabled={busy}>
        {busy ? '…' : 'Guardar'}
      </button>
      {msg && <span className="tier-msg">{msg}</span>}
    </div>
  )
}

// Partner-code creation + listing.
function CodesSection({ credential }) {
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tier, setTier] = useState('team')
  const [max, setMax] = useState(TIER_DEFAULT_MAX.team)
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminApi(credential, 'listCodes')
      setCodes(data.codes || [])
    } catch (e) {
      setError(e.message || 'No se pudieron cargar los códigos')
    } finally {
      setLoading(false)
    }
  }, [credential])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch codes on mount
  useEffect(() => { load() }, [load])

  function changeTier(next) {
    setTier(next)
    setMax(TIER_DEFAULT_MAX[next])
  }

  async function create() {
    setCreating(true)
    setError('')
    try {
      const data = await adminApi(credential, 'createCode', {
        tier,
        maxFighters: Number(max),
        note: note.trim(),
      })
      setCodes((prev) => [data.code, ...prev])
      setNote('')
    } catch (e) {
      setError(e.message || 'No se pudo crear el código')
    } finally {
      setCreating(false)
    }
  }

  function copy(code) {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  return (
    <div className="codes-section">
      <h3 className="admin-title" style={{ fontSize: 16 }}>Códigos de partner</h3>

      <div className="code-create">
        <select value={tier} onChange={(e) => changeTier(e.target.value)} disabled={creating}>
          {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <input
          type="number"
          min="0"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          disabled={creating}
          aria-label="Cupo"
          title="Cupo de peleadores por evento"
        />
        <input
          type="text"
          placeholder="Nota (ej: Academia X)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={creating}
        />
        <button className="btn-approve" onClick={create} disabled={creating}>
          {creating ? '…' : 'Crear código'}
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading ? (
        <p className="admin-sub" style={{ padding: 12 }}>Cargando códigos…</p>
      ) : codes.length === 0 ? (
        <p className="admin-sub" style={{ padding: 12 }}>Todavía no hay códigos.</p>
      ) : (
        <div className="code-list">
          {codes.map((c) => (
            <div key={c.code} className="code-row">
              <div className="code-main">
                <span className="code-value">{c.code}</span>
                <span className="code-meta">
                  {TIER_LABEL[c.tier] || c.tier} · {c.maxFighters} · {c.note || 'sin nota'}
                </span>
                <span className="code-meta">
                  {c.redeemedBy ? `Canjeado por ${c.redeemedBy} (${fmtDate(c.redeemedAt)})` : 'Sin canjear'}
                </span>
              </div>
              <button className="btn-ghost" onClick={() => copy(c.code)} disabled={!!c.redeemedBy}>
                {copied === c.code ? '✓' : 'Copiar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminPanel({ credential, adminEmail }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyEmail, setBusyEmail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await adminApi(credential, 'list')
      setUsers(data.users || [])
    } catch (e) {
      setError(e.message || 'No se pudo cargar la lista')
    } finally {
      setLoading(false)
    }
  }, [credential])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch users on mount
  useEffect(() => { load() }, [load])

  async function setStatus(email, status) {
    setBusyEmail(email)
    setError('')
    try {
      await adminApi(credential, 'setStatus', { email, status })
      setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, status } : u)))
    } catch (e) {
      setError(e.message || 'No se pudo actualizar')
    } finally {
      setBusyEmail(null)
    }
  }

  function onTierSaved(email, patch) {
    setUsers((prev) => prev.map((u) => (u.email === email ? { ...u, ...patch } : u)))
  }

  const pending = users.filter((u) => u.status === 'pending').length

  return (
    <div className="admin-screen">
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Usuarios</h2>
          <p className="admin-sub">
            {users.length} registrados{pending > 0 ? ` · ${pending} pendiente(s)` : ''}
          </p>
        </div>
        <button className="btn-ghost" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Actualizar'}
        </button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading && users.length === 0 ? (
        <p className="admin-sub" style={{ padding: 16 }}>Cargando…</p>
      ) : users.length === 0 ? (
        <p className="admin-sub" style={{ padding: 16 }}>Todavía no hay usuarios.</p>
      ) : (
        <div className="admin-list">
          {users.map((u) => {
            const isAdmin = u.email === adminEmail
            const busy = busyEmail === u.email
            return (
              <div key={u.email} className="admin-row">
                <div className="admin-user">
                  {u.picture
                    ? <img src={u.picture} alt="" className="admin-avatar" referrerPolicy="no-referrer" />
                    : <span className="admin-avatar admin-avatar-fallback">{(u.name || u.email || '?').charAt(0).toUpperCase()}</span>}
                  <div className="admin-user-info">
                    <div className="admin-user-name">{u.name || u.email}{isAdmin && ' 👑'}</div>
                    <div className="admin-user-email">{u.email}</div>
                    <div className="admin-user-meta">
                      {TIER_LABEL[u.tier] || u.tier || 'Fighter'} · cupo {u.maxFighters ?? TIER_DEFAULT_MAX[u.tier || 'fighter']}
                      {u.features?.realtimeAlerts ? ' · alertas' : ''}
                    </div>
                    <div className="admin-user-meta">
                      Últ. acceso {fmtDate(u.lastSeen)} · {u.loginCount || 0} logins
                    </div>
                  </div>
                </div>

                <div className="admin-actions">
                  <span className={`status-pill status-${u.status}`}>{STATUS_LABEL[u.status] || u.status}</span>
                  {!isAdmin && (
                    <div className="admin-buttons">
                      {u.status !== 'approved' && (
                        <button className="btn-approve" disabled={busy} onClick={() => setStatus(u.email, 'approved')}>
                          Aprobar
                        </button>
                      )}
                      {u.status !== 'blocked' && (
                        <button className="btn-block" disabled={busy} onClick={() => setStatus(u.email, 'blocked')}>
                          Bloquear
                        </button>
                      )}
                      {u.status === 'blocked' && (
                        <button className="btn-ghost" disabled={busy} onClick={() => setStatus(u.email, 'pending')}>
                          A pendiente
                        </button>
                      )}
                    </div>
                  )}
                  {!isAdmin && (
                    <TierEditor user={u} credential={credential} onSaved={onTierSaved} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <CodesSection credential={credential} />
    </div>
  )
}
