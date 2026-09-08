import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, loadGsi } from '../auth/googleAuth'
import hero from '../assets/hero.png'

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
      <div className="login-card">
        <img src={hero} alt="Combat Follow" className="login-hero" />
        <div className="login-brand">
          <div className="login-title">COMBAT FOLLOW</div>
          <div className="login-subtitle">by Frames and Chokes</div>
        </div>
        <p className="login-text">Inicia sesión para seguir tus luchadores.</p>

        <div className="login-btn-wrap" ref={buttonRef} style={verifying ? { display: 'none' } : undefined} />
        {verifying && <p className="login-text">Verificando…</p>}

        {shownError && <p className="login-error">{shownError}</p>}
      </div>
    </div>
  )
}
