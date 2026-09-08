import { useState } from 'react'
import { IconClose } from './icons'

const FIELDS = [
  { key: 'toEmail', label: 'Tu email', placeholder: 'tu@gmail.com', type: 'email' },
  { key: 'serviceId', label: 'Service ID', placeholder: 'service_xxxxxxx', type: 'text' },
  { key: 'templateId', label: 'Template ID', placeholder: 'template_xxxxxxx', type: 'text' },
  { key: 'publicKey', label: 'Public Key', placeholder: 'xxxxxxxxxxxxxx', type: 'text' },
]

// Email (EmailJS) notification settings, opened from the account menu.
export default function NotificationsModal({ emailConfig, onSave, onClose }) {
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
          <div className="qr-title">Notificaciones por email</div>
          <button className="qr-close" onClick={onClose} aria-label="Cerrar"><IconClose size={16} /></button>
        </div>

        <div style={{ textAlign: 'left' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            Crea una cuenta gratis en <strong style={{ color: 'var(--text)' }}>emailjs.com</strong> y pegá tus credenciales para recibir un email cuando falten menos de 10 minutos para un combate.
          </p>

          {FIELDS.map(({ key, label, placeholder, type }) => (
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
      </div>
    </div>
  )
}
