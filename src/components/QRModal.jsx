import { useState } from 'react'

export default function QRModal({ fighters, emailConfig, onClose }) {
  const [copied, setCopied] = useState(false)

  let url = null
  let encodeError = null

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
    encodeError = 'Error al generar el enlace.'
  }

  function handleCopy() {
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Pasar al móvil</div>
          <button className="qr-close" onClick={onClose}>✕</button>
        </div>
        <div className="qr-body" style={{ padding: '1rem' }}>
          {encodeError ? (
            <p style={{ color: '#e55', fontSize: 13, textAlign: 'center' }}>{encodeError}</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, textAlign: 'center' }}>
                Copia este enlace y ábrelo en el móvil
              </p>
              <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--text-secondary)', wordBreak: 'break-all', marginBottom: 12, maxHeight: 80, overflow: 'hidden' }}>
                {url}
              </div>
              <button
                onClick={handleCopy}
                style={{ width: '100%', padding: '10px', background: copied ? '#2a7a2a' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                {copied ? '✓ Copiado' : 'Copiar enlace'}
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
