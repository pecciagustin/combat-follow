import { useState } from 'react'
import logoCf from '../assets/logo-cf.png'
import { redeemCode } from '../auth/googleAuth'

// Shown to authenticated users who are not (yet) approved.
export default function StatusScreen({ status, user, onSignOut, credential, onRedeemed }) {
  const isBlocked = status === 'blocked'
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function handleRedeem(e) {
    e.preventDefault()
    if (!code.trim() || !credential) return
    setBusy(true)
    setErr('')
    try {
      await redeemCode(credential, code.trim())
      await onRedeemed?.() // refresh session → status becomes 'approved'
    } catch (e2) {
      setErr(e2.message || 'No se pudo canjear el código')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logoCf} alt="Combat Follow" className="login-logo-img" />
        <div className="login-brand">
          <div className="login-title">COMBAT FOLLOW</div>
          <div className="login-subtitle">by Frames and Chokes</div>
        </div>

        {isBlocked ? (
          <>
            <div className="status-badge status-blocked">Acceso bloqueado</div>
            <p className="login-text">
              Tu cuenta no tiene acceso a esta app. Si creés que es un error,
              contactá al administrador.
            </p>
          </>
        ) : (
          <>
            <div className="status-badge status-pending">Pendiente de aprobación</div>
            <p className="login-text">
              Tu solicitud fue registrada. Un administrador debe aprobar tu
              acceso antes de que puedas usar la app.
            </p>
          </>
        )}

        {user?.email && <p className="status-email">{user.email}</p>}

        {!isBlocked && (
          <form onSubmit={handleRedeem} className="redeem-form">
            <label className="redeem-label">¿Tenés un código de invitación?</label>
            <div className="redeem-row">
              <input
                type="text"
                className="redeem-input"
                placeholder="CF-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button type="submit" className="btn-primary" disabled={busy || !code.trim()}>
                {busy ? '…' : 'Canjear'}
              </button>
            </div>
            {err && <p className="redeem-error">{err}</p>}
          </form>
        )}

        <button className="btn-ghost login-signout" onClick={onSignOut}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
