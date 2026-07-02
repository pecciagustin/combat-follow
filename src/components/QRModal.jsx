import { QRCodeSVG } from 'qrcode.react'
import { Component, useState } from 'react'
import LZString from 'lz-string'

class QRErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: false }
  }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

function buildPayload(fighters, emailConfig) {
  return {
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
}

export default function QRModal({ fighters, emailConfig, onClose }) {
  const [copied, setCopied] = useState(false)
  const [showLink, setShowLink] = useState(false)

  const payload = buildPayload(fighters, emailConfig)
  const json = JSON.stringify(payload)

  // Compressed URL (for QR)
  const compressedEncoded = LZString.compressToEncodedURIComponent(json)
  const qrUrl = `${window.location.origin}${window.location.pathname}?importz=${compressedEncoded}`

  // Plain URL (fallback link)
  let plainUrl = null
  try {
    const encoded = btoa(unescape(encodeURIComponent(json)))
    plainUrl = `${window.location.origin}${window.location.pathname}?import=${encoded}`
  } catch { /* too long even for plain */ }

  function handleCopy() {
    const url = plainUrl || qrUrl
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const linkSection = (
    <div style={{ marginTop: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, textAlign: 'center' }}>
        O copia el enlace para pegar en el móvil
      </p>
      <button
        onClick={handleCopy}
        style={{ width: '100%', padding: '9px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        {copied ? '✓ Enlace copiado' : 'Copiar enlace'}
      </button>
    </div>
  )

  const qrFallback = (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Demasiados datos para el QR ({fighters.length} luchadores).
      </p>
      <button
        onClick={handleCopy}
        style={{ padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
      >
        {copied ? '✓ Enlace copiado' : 'Copiar enlace'}
      </button>
    </div>
  )

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Pasar al móvil</div>
          <button className="qr-close" onClick={onClose}>✕</button>
        </div>
        <div className="qr-body" style={{ padding: '1rem' }}>
          {!showLink ? (
            <>
              <QRErrorBoundary fallback={qrFallback}>
                <QRCodeSVG
                  value={qrUrl}
                  size={220}
                  bgColor="#ffffff"
                  fgColor="#0f0f0f"
                  level="L"
                />
              </QRErrorBoundary>
              {linkSection}
            </>
          ) : (
            <>
              <button
                onClick={handleCopy}
                style={{ width: '100%', padding: '10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}
              >
                {copied ? '✓ Copiado' : 'Copiar enlace'}
              </button>
              <button onClick={() => setShowLink(false)} style={{ width: '100%', padding: '8px', background: 'none', color: 'var(--text-secondary)', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                ← Volver al QR
              </button>
            </>
          )}
        </div>
        <p className="qr-fighters" style={{ padding: '0 1rem 1rem' }}>
          {fighters.length} luchador{fighters.length !== 1 ? 'es' : ''}: {fighters.map(f => f.name).join(', ')}
        </p>
      </div>
    </div>
  )
}
