import { useState } from 'react'

export default function SetupPanel({ fighters, onAdd, onRemove, onEdit, emailConfig, onEmailConfig, onShowQR, onShowScanner, onClearAll }) {
  const [name, setName] = useState('')
  const [matchlistUrl, setMatchlistUrl] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [emailDraft, setEmailDraft] = useState(emailConfig)
  const [emailSaved, setEmailSaved] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editMatchlistUrl, setEditMatchlistUrl] = useState('')
  const [editDiscipline, setEditDiscipline] = useState('')

  function handleEmailSave() {
    onEmailConfig(emailDraft)
    setEmailSaved(true)
    setTimeout(() => setEmailSaved(false), 2000)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const trimName = name.trim()
    const trimUrl = matchlistUrl.trim()
    if (!trimName || !trimUrl) return
    onAdd({ name: trimName, bracketUrl: trimUrl, matchlistUrl: trimUrl, discipline: discipline || null })
    setName('')
    setMatchlistUrl('')
    setDiscipline('')
  }

  function startEdit(f) {
    setEditingId(f.id)
    setEditName(f.name)
    setEditMatchlistUrl(f.matchlistUrl || f.bracketUrl || '')
    setEditDiscipline(f.discipline || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditMatchlistUrl('')
    setEditDiscipline('')
  }

  function handleEditSave(id) {
    const trimName = editName.trim()
    const trimUrl = editMatchlistUrl.trim()
    if (!trimName || !trimUrl) return
    onEdit(id, { name: trimName, bracketUrl: trimUrl, matchlistUrl: trimUrl, discipline: editDiscipline || null })
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
            placeholder="Ej: JoelJoan Gallego Marrufo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
          />
        </div>
        <div className="form-group">
          <label htmlFor="fighter-matchlist">Matchlist URL</label>
          <input
            id="fighter-matchlist"
            type="url"
            placeholder="https://.../schedule/matchlist?search=nombre"
            value={matchlistUrl}
            onChange={(e) => setMatchlistUrl(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>
        <div className="form-group">
          <label>Disciplina <span style={{ color: 'var(--text-secondary)', fontWeight: 400, textTransform: 'none' }}>(si pelea en las dos)</span></label>
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, padding: '12px 14px', minHeight: 44, outline: 'none' }}
          >
            <option value="">— Cualquiera —</option>
            <option value="gi">GI</option>
            <option value="nogi">No-Gi</option>
          </select>
        </div>
        <button
          type="submit"
          className="btn-primary"
          style={{ width: '100%' }}
          disabled={!name.trim() || !matchlistUrl.trim()}
        >
          + Agregar
        </button>
      </form>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="fighter-list-header">Luchadores ({fighters.length})</div>
          {fighters.length > 0 && (
            <button className="btn-danger" style={{ fontSize: 11, minHeight: 28, padding: '0 10px' }} onClick={onClearAll}>
              Limpiar todo
            </button>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} onClick={onShowScanner}>
              📷 Escanear QR
            </button>
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} onClick={onShowQR}>
                📱 Generar QR
              </button>
            )}
          </div>
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
                        <label>Matchlist URL</label>
                        <input
                          type="url"
                          value={editMatchlistUrl}
                          onChange={(e) => setEditMatchlistUrl(e.target.value)}
                          placeholder="https://.../schedule/matchlist?search=nombre"
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label>Disciplina</label>
                        <select
                          value={editDiscipline}
                          onChange={(e) => setEditDiscipline(e.target.value)}
                          style={{ width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, padding: '10px 14px', minHeight: 44, outline: 'none' }}
                        >
                          <option value="">— Cualquiera —</option>
                          <option value="gi">GI</option>
                          <option value="nogi">No-Gi</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-primary"
                          style={{ flex: 1 }}
                          onClick={() => handleEditSave(f.id)}
                          disabled={!editName.trim() || !editMatchlistUrl.trim()}
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
                        <div className="fighter-item-name">
                          {f.name}
                          {f.discipline && <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>({f.discipline === 'gi' ? 'GI' : 'No-Gi'})</span>}
                        </div>
                        <div className="fighter-item-url">{f.matchlistUrl || f.bracketUrl}</div>
                      </div>
                      <button className="btn-ghost" onClick={() => startEdit(f)} aria-label={`Editar ${f.name}`}>✎</button>
                      <button className="btn-danger" onClick={() => onRemove(f.id)} aria-label={`Eliminar ${f.name}`}>✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EmailJS config */}
      <div className="add-fighter-form" style={{ marginTop: 24 }}>
        <h2>Notificaciones por Email</h2>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
          Crea una cuenta gratis en <strong style={{ color: 'var(--text)' }}>emailjs.com</strong> y pega tus credenciales aquí para recibir emails cuando haya cambios de horario o un luchador entre en combate.
        </p>
        {[
          { key: 'toEmail', label: 'Tu email', placeholder: 'tu@gmail.com', type: 'email' },
          { key: 'serviceId', label: 'Service ID', placeholder: 'service_xxxxxxx', type: 'text' },
          { key: 'templateId', label: 'Template ID', placeholder: 'template_xxxxxxx', type: 'text' },
          { key: 'publicKey', label: 'Public Key', placeholder: 'xxxxxxxxxxxxxx', type: 'text' },
        ].map(({ key, label, placeholder, type }) => (
          <div className="form-group" key={key}>
            <label>{label}</label>
            <input
              type={type}
              placeholder={placeholder}
              value={emailDraft[key] || ''}
              onChange={(e) => setEmailDraft((d) => ({ ...d, [key]: e.target.value }))}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        ))}
        <button className="btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={handleEmailSave}>
          {emailSaved ? '✓ Guardado' : 'Guardar'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.5 }}>
          En EmailJS, crea un template con las variables: <code style={{ color: 'var(--accent)' }}>{'{{to_email}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{fighter_name}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{changes}}'}</code>, <code style={{ color: 'var(--accent)' }}>{'{{time}}'}</code>
        </p>
      </div>
    </div>
  )
}
