import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

export default function QRScanner({ onResult, onClose }) {
  const videoRef = useRef(null)
  const scannerRef = useRef(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!videoRef.current) return

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        onResult(result.data)
        scanner.stop()
      },
      {
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
      }
    )
    scannerRef.current = scanner

    scanner.start().catch((err) => {
      setError('No se pudo acceder a la cámara. Permite el acceso en Ajustes.')
      console.error(err)
    })

    return () => scanner.destroy()
  }, [onResult])

  return (
    <div className="qr-overlay" onClick={onClose}>
      <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="qr-header">
          <div className="qr-title">Escanear QR</div>
          <button className="qr-close" onClick={onClose}>✕</button>
        </div>
        {error ? (
          <div style={{ padding: '24px 0', color: '#ff8888', fontSize: 13, textAlign: 'center' }}>
            {error}
          </div>
        ) : (
          <div style={{ borderRadius: 8, overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} style={{ width: '100%', display: 'block' }} />
          </div>
        )}
        <p className="qr-hint" style={{ marginTop: 12 }}>
          Apunta al QR generado en el ordenador.<br />
          Los luchadores se cargarán automáticamente.
        </p>
      </div>
    </div>
  )
}
