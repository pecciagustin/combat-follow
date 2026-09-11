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

// Tech-partner links: create an affiliate link for an event that auto-approves
// and scopes whoever joins, and see who joined through each one.
function PartnersSection({ credential }) {
  const [partners, setPartners] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ eventName: '', matchlistUrl: '', maxFighters: 15, note: '' })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState('')
  const [membersFor, setMembersFor] = useState(null)
  const [members, setMembers] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const d = await adminApi(credential, 'listPartners')
      setPartners(d.partners || [])
    } catch (e) {
      setError(e.message || 'No se pudo cargar')
    } finally {
      setLoading(false)
    }
  }, [credential])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
  useEffect(() => { load() }, [load])

  const linkFor = (token) => `${window.location.origin}/?partner=${token}`

  async function create() {
    if (!form.eventName.trim() || !form.matchlistUrl.trim()) return
    setCreating(true)
    setError('')
    try {
      const d = await adminApi(credential, 'createPartner', {
        eventName: form.eventName.trim(),
        matchlistUrl: form.matchlistUrl.trim(),
        maxFighters: Number(form.maxFighters),
        note: form.note.trim(),
      })
      setPartners((prev) => [d.partner, ...prev])
      setForm({ eventName: '', matchlistUrl: '', maxFighters: 15, note: '' })
      setOpen(false)
    } catch (e) {
      setError(e.message || 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(p) {
    setError('')
    try {
      const d = await adminApi(credential, 'setPartnerActive', { token: p.token, active: !p.active })
      setPartners((prev) => prev.map((x) => (x.token === p.token ? d.partner : x)))
    } catch (e) {
      setError(e.message || 'Error')
    }
  }

  async function copyLink(token) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopied(token)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* ignore */ }
  }

  async function showMembers(token) {
    if (membersFor === token) { setMembersFor(null); setMembers([]); return }
    setMembersFor(token)
    setMembers([])
    try {
      const d = await adminApi(credential, 'listPartnerMembers', { token })
      setMembers(d.members || [])
    } catch (e) {
      setError(e.message || 'Error')
    }
  }

  return (
    <div className="partners-section">
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Partners (links de evento)</h2>
          <p className="admin-sub">{partners.length} link(s)</p>
        </div>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>{open ? 'Cancelar' : '+ Nuevo'}</button>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {open && (
        <div className="partner-form">
          <input placeholder="Nombre del evento…" value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} autoComplete="off" />
          <input placeholder="Match list (URL)…" value={form.matchlistUrl} onChange={(e) => setForm({ ...form, matchlistUrl: e.target.value })} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
          <div className="partner-form-row">
            <input type="number" min="1" value={form.maxFighters} onChange={(e) => setForm({ ...form, maxFighters: e.target.value })} aria-label="Cupo por atleta" title="Cupo de seguimientos por atleta" />
            <input placeholder="Nota (opcional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} autoComplete="off" />
          </div>
          <button className="btn-approve" disabled={creating || !form.eventName.trim() || !form.matchlistUrl.trim()} onClick={create}>
            {creating ? '…' : 'Crear link'}
          </button>
        </div>
      )}

      {loading && partners.length === 0 ? (
        <p className="admin-sub" style={{ padding: 12 }}>Cargando…</p>
      ) : partners.length === 0 ? (
        <p className="admin-sub" style={{ padding: 12 }}>Sin partners todavía.</p>
      ) : (
        <div className="partner-list">
          {partners.map((p) => (
            <div key={p.token} className="partner-row">
              <div className="partner-head">
                <div className="partner-main">
                  <div className="partner-name">{p.eventName}{!p.active && <span className="partner-off">inactivo</span>}</div>
                  <div className="partner-link" title={linkFor(p.token)}>{linkFor(p.token)}</div>
                  <div className="admin-user-meta">cupo {p.maxFighters} · {p.joinedCount || 0} atleta(s){p.note ? ` · ${p.note}` : ''}</div>
                </div>
                <div className="partner-actions">
                  <button className="btn-ghost" onClick={() => copyLink(p.token)}>{copied === p.token ? '✓ Copiado' : 'Copiar'}</button>
                  <button className="btn-ghost" onClick={() => showMembers(p.token)}>{membersFor === p.token ? 'Ocultar' : 'Ver'}</button>
                  <button className={p.active ? 'btn-block' : 'btn-approve'} onClick={() => toggleActive(p)}>{p.active ? 'Desactivar' : 'Activar'}</button>
                </div>
              </div>
              {membersFor === p.token && (
                <div className="partner-members">
                  {members.length === 0 ? (
                    <span className="admin-sub">Sin atletas aún.</span>
                  ) : (
                    members.map((m) => (
                      <div key={m.email} className="partner-member">
                        {m.name || m.email} <span className="admin-user-email">{m.email}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
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
      <PartnersSection credential={credential} />

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
                    {u.source?.type === 'partner' && (
                      <div className="admin-user-meta admin-source">vía {u.source.eventName || 'partner'}</div>
                    )}
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
    </div>
  )
}
