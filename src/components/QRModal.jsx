import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

export default function QRModal({ fighters, emailConfig, onClose }) {
  const [qrError, setQrError] = useState(null)

  let url = null
  try {
    const payload = {
      fighters: fighters.map(({ name, bracketUrl, matchlistUrl, discipline, trackMode, mat, fightNum }) => {
        const f = { name }
        if (bracketUrl) f.bracketUrl = bracketUrl
        if (matchlistUrl && matchlistUrl !== bracketUrl) f.matchlistUrl = matchlistUrl
        if (discipline) f.discipline = discipline
        if (trackMode) f.trackMode = trackMode
        if (mat) f.mat = mat
        if (fightNum) f.fightNum = fightNum
        return f
      }),
      email: emailConfig,
    }
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    url = `${window.location.origin}${window.location.pathname}?import=${encoded}`
  } catch (e) {
    // will render error below
  }

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Escanear desde el móvil</div>
          <button className="qr-close" onClick={onClose}>✕</button>
        </div>
        <div className="qr-body">
          {url ? (
            <QRCodeSVG
              value={url}
              size={220}
              bgColor="#ffffff"
              fgColor="#0f0f0f"
              level="M"
            />
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '1rem' }}>
              Error al generar el QR. Intenta con menos luchadores.
            </p>
          )}
          {qrError && (
            <p style={{ color: '#e55', fontSize: 12, textAlign: 'center', marginTop: 8 }}>{qrError}</p>
          )}
        </div>
        <p className="qr-hint">
          Abre la cámara del iPhone y apunta al QR.<br />
          Se abrirá la app con luchadores y email configurados.
        </p>
        <p className="qr-fighters">
          {fighters.length} luchador{fighters.length !== 1 ? 'es' : ''}: {fighters.map(f => f.name).join(', ')}
        </p>
      </div>
    </div>
  )
}
