import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, loadGsi } from '../auth/googleAuth'
import logoCf from '../assets/logo-cf.png'

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
          <img src={logoCf} alt="Combat Follow" className="login-logo-img" />
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
