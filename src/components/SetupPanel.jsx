import { useState } from 'react'

export default function SetupPanel({ fighters, onAdd, onRemove }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimName = name.trim()
    const trimUrl = url.trim()
    if (!trimName || !trimUrl) return
    onAdd({ name: trimName, bracketUrl: trimUrl })
    setName('')
    setUrl('')
  }

  return (
    <div className="setup-panel">
      <form className="add-fighter-form" onSubmit={handleSubmit}>
        <h2>Agregar Luchador</h2>
        <div className="form-group">
          <label htmlFor="fighter-name">Nombre</label>
          <input
            id="fighter-name"
            type="text"
            placeholder="Ej: Juan García"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
          />
        </div>
        <div className="form-group">
          <label htmlFor="fighter-url">Bracket URL (Smoothcomp)</label>
          <input
            id="fighter-url"
            type="url"
            placeholder="https://dbjj.smoothcomp.com/en/event/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          style={{ width: '100%' }}
          disabled={!name.trim() || !url.trim()}
        >
          + Agregar
        </button>
      </form>

      <div>
        <div className="fighter-list-header">
          Luchadores ({fighters.length})
        </div>
        <div style={{ marginTop: 8 }}>
          {fighters.length === 0 ? (
            <div className="fighter-list-empty">
              No hay luchadores aún.<br />Agrega uno arriba.
            </div>
          ) : (
            <div className="fighter-list">
              {fighters.map((f) => (
                <div key={f.id} className="fighter-item">
                  <div className="fighter-item-info">
                    <div className="fighter-item-name">{f.name}</div>
                    <div className="fighter-item-url">{f.bracketUrl}</div>
                  </div>
                  <button
                    className="btn-danger"
                    onClick={() => onRemove(f.id)}
                    aria-label={`Eliminar ${f.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
