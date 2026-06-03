import { useState } from 'react'

export default function SetupPanel({ fighters, onAdd, onRemove, onEdit }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    const trimName = name.trim()
    const trimUrl = url.trim()
    if (!trimName || !trimUrl) return
    onAdd({ name: trimName, bracketUrl: trimUrl })
    setName('')
    setUrl('')
  }

  function startEdit(f) {
    setEditingId(f.id)
    setEditName(f.name)
    setEditUrl(f.bracketUrl)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditUrl('')
  }

  function handleEditSave(id) {
    const trimName = editName.trim()
    const trimUrl = editUrl.trim()
    if (!trimName || !trimUrl) return
    onEdit(id, { name: trimName, bracketUrl: trimUrl })
    cancelEdit()
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
                <div key={f.id} className="fighter-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  {editingId === f.id ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label>Nombre</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="words"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label>Bracket URL</label>
                        <input
                          type="url"
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-primary"
                          style={{ flex: 1 }}
                          onClick={() => handleEditSave(f.id)}
                          disabled={!editName.trim() || !editUrl.trim()}
                        >
                          Guardar
                        </button>
                        <button className="btn-ghost" onClick={cancelEdit}>
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="fighter-item-info">
                        <div className="fighter-item-name">{f.name}</div>
                        <div className="fighter-item-url">{f.bracketUrl}</div>
                      </div>
                      <button
                        className="btn-ghost"
                        onClick={() => startEdit(f)}
                        aria-label={`Editar ${f.name}`}
                      >
                        ✎
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => onRemove(f.id)}
                        aria-label={`Eliminar ${f.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
