import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../auth/googleAuth'

const STATUS_LABEL = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  blocked: 'Bloqueado',
}

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
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
