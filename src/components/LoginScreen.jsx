import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, decodeJwt, loadGsi } from '../auth/googleAuth'
import hero from '../assets/hero.png'

export default function LoginScreen({ onSignIn }) {
  const buttonRef = useRef(null)
  const [error, setError] = useState(
    GOOGLE_CLIENT_ID ? '' : 'Falta configurar VITE_GOOGLE_CLIENT_ID.'
  )

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false

    loadGsi()
      .then((google) => {
        if (cancelled || !buttonRef.current) return

        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            const profile = decodeJwt(response.credential)
            if (!profile) {
              setError('No se pudo leer la respuesta de Google.')
              return
            }
            onSignIn({
              sub: profile.sub,
              name: profile.name,
              email: profile.email,
              picture: profile.picture,
            })
          },
        })

        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
        })

        // Optional One Tap prompt for returning users.
        google.accounts.id.prompt()
      })
      .catch(() => setError('No se pudo cargar Google Sign-In. Revisa tu conexión.'))

    return () => { cancelled = true }
  }, [onSignIn])

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={hero} alt="Combat Follow" className="login-hero" />
        <div className="login-brand">
          <div className="login-title">COMBAT FOLLOW</div>
          <div className="login-subtitle">by Frames and Chokes</div>
        </div>
        <p className="login-text">Inicia sesión para seguir tus luchadores.</p>

        <div className="login-btn-wrap" ref={buttonRef} />

        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  )
}
