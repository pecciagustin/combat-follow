import { useState, useEffect } from 'react'
import { IconClose } from './icons'
import {
  subscribeToPush,
  getExistingSubscription,
  unsubscribeFromPush,
  registerPushSubscription,
  unregisterPushSubscription,
} from '../api/pushNotifications'

const EMAIL_FIELDS = [
  { key: 'toEmail', label: 'Tu email', placeholder: 'tu@gmail.com', type: 'email' },
  { key: 'serviceId', label: 'Service ID', placeholder: 'service_xxxxxxx', type: 'text' },
  { key: 'templateId', label: 'Template ID', placeholder: 'template_xxxxxxx', type: 'text' },
  { key: 'publicKey', label: 'Public Key', placeholder: 'xxxxxxxxxxxxxx', type: 'text' },
]

function getInitialPushStatus() {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey || typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return 'denied'
  return 'loading'
}

function PushSection({ credential }) {
  const [pushStatus, setPushStatus] = useState(getInitialPushStatus)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pushStatus !== 'loading') return
    getExistingSubscription()
      .then((sub) => setPushStatus(sub ? 'subscribed' : 'unsubscribed'))
      .catch(() => setPushStatus('unsubscribed'))
  }, [pushStatus])

  async function handleSubscribe() {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'unsubscribed')
        return
      }
      const sub = await subscribeToPush()
      await registerPushSubscription(credential, sub)
      setPushStatus('subscribed')
    } catch (err) {
      console.error('Push subscribe error:', err)
      alert('Error al activar notificaciones: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUnsubscribe() {
    setBusy(true)
    try {
      const sub = await unsubscribeFromPush()
      if (sub) await unregisterPushSubscription(credential, sub.endpoint)
      setPushStatus('unsubscribed')
    } catch (err) {
      console.error('Push unsubscribe error:', err)
    } finally {
      setBusy(false)
    }
  }

  if (pushStatus === 'loading') return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
        Notificaciones push
      </div>

      {pushStatus === 'unsupported' && (
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Tu navegador no soporta notificaciones push. En iOS, necesitas instalar la app (Safari → Compartir → Agregar a pantalla de inicio) con iOS 16.4 o superior.
        </p>
      )}

      {pushStatus === 'denied' && (
        <p style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.5 }}>
          Las notificaciones están bloqueadas. Habilitá los permisos desde la configuración del navegador.
        </p>
      )}

      {pushStatus === 'unsubscribed' && (
        <button
          className="btn-primary"
          style={{ width: '100%' }}
          onClick={handleSubscribe}
          disabled={busy}
        >
          {busy ? 'Activando...' : 'Activar notificaciones push'}
        </button>
      )}

      {pushStatus === 'subscribed' && (
        <>
          <p style={{ fontSize: 12, color: '#22c55e', marginBottom: 8 }}>
            Notificaciones push activadas
          </p>
          <button
            className="btn-ghost"
            style={{ width: '100%', fontSize: 12 }}
            onClick={handleUnsubscribe}
            disabled={busy}
          >
            {busy ? 'Desactivando...' : 'Desactivar'}
          </button>
        </>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
        Recibí una notificación en tu dispositivo cuando un peleador que seguís está por competir (menos de 10 minutos).
      </p>
    </div>
  )
}

export default function NotificationsModal({ emailConfig, onSave, onClose, credential, isAdmin }) {
  const [draft, setDraft] = useState(emailConfig || { serviceId: '', templateId: '', publicKey: '', toEmail: '' })
  const [saved, setSaved] = useState(false)

  function save() {
    onSave(draft)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal notif-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Notificaciones</div>
          <button className="qr-close" onClick={onClose} aria-label="Cerrar"><IconClose size={16} /></button>
        </div>

        <div style={{ textAlign: 'left' }}>
          <PushSection credential={credential} />

          {isAdmin && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>
                  Notificaciones por email (admin)
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                  Crea una cuenta gratis en <strong style={{ color: 'var(--text)' }}>emailjs.com</strong> y pega tus credenciales para recibir un email cuando falten menos de 10 minutos para un combate.
                </p>

                {EMAIL_FIELDS.map(({ key, label, placeholder, type }) => (
                  <div className="form-group" key={key}>
                    <label>{label}</label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={draft[key] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                    />
                  </div>
                ))}

                <button className="btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={save}>
                  {saved ? '✓ Guardado' : 'Guardar'}
                </button>

                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
                  En EmailJS, crea un template con las variables: <code style={{ color: 'var(--accent)' }}>{'{{to_email}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{fighter_name}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{changes}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{time}}'}</code>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
