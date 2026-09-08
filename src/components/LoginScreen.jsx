import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, loadGsi } from '../auth/googleAuth'

export default function LoginScreen({ onCredential, error: externalError }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState(
    GOOGLE_CLIENT_ID ? '' : 'Falta configurar VITE_GOOGLE_CLIENT_ID.'
  )
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false

    loadGsi()
      .then((google) => {
        if (cancelled || !buttonRef.current) return

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            setError('')
            setVerifying(true)
            Promise.resolve(onCredential(response.credential))
              .catch(() => { /* error surfaced via externalError */ })
              .finally(() => { if (!cancelled) setVerifying(false) })
          },
        })

        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
        })

        google.accounts.id.prompt()
      })
      .catch(() => setError('No se pudo cargar Google Sign-In. Revisa tu conexión.'))

    return () => { cancelled = true }
  }, [onCredential])

  const shownError = error || externalError

  return (
    <div className="login-screen">
      <div className="login-inner">
        <div className="login-hero-block">
          <div className="login-logo">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 4v7a6 6 0 0 0 12 0V4" />
              <path d="M6 4H4M18 4h2M9 20h6" />
            </svg>
          </div>
          <div className="login-title">COMBAT FOLLOW</div>
          <div className="login-subtitle">by Frames and Chokes</div>
          <p className="login-tagline">Seguí a tus peleadores en vivo, mat por mat.</p>
        </div>

        <div className="login-cta">
          <div className="login-btn-wrap" ref={buttonRef} style={verifying ? { display: 'none' } : undefined} />
          {verifying && <p className="login-text" style={{ margin: 0 }}>Verificando…</p>}
          {shownError && <p className="login-error">{shownError}</p>}
          {!shownError && !verifying && (
            <p className="login-foot">Solo cuentas aprobadas por el administrador.</p>
          )}
        </div>
      </div>
    </div>
  )
}
