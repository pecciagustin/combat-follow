import { useState } from 'react'

const selectStyle = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, padding: '12px 14px', minHeight: 44, outline: 'none' }

function buildWatchUrl(fighters) {
  const minimal = fighters.map(f => ({
    name: f.name,
    url: f.matchlistUrl || f.bracketUrl || '',
    ...(f.discipline ? { discipline: f.discipline } : {}),
    ...(f.trackMode === 'fight' ? { trackMode: 'fight', mat: f.mat, fightNum: f.fightNum } : {}),
  }))
  const encoded = btoa(JSON.stringify(minimal))
  return `https://combat-follow.vercel.app/api/watch?f=${encoded}`
}

export default function SetupPanel({ fighters, onAdd, onRemove, onEdit, emailConfig, onEmailConfig, onShowQR, onShowScanner, onClearAll, onPasteImport }) {
  const [addMode, setAddMode] = useState('fighter') // 'fighter' | 'fight'
  const [pasteLink, setPasteLink] = useState('')
  const [pasteSuccess, setPasteSuccess] = useState(false)
  const [watchCopied, setWatchCopied] = useState(false)

  function copyWatchUrl() {
    const url = buildWatchUrl(fighters)
    navigator.clipboard.writeText(url).then(() => {
      setWatchCopied(true)
      setTimeout(() => setWatchCopied(false), 2500)
    })
  }

  // fighter form
  const [name, setName] = useState('')
  const [matchlistUrl, setMatchlistUrl] = useState('')
  const [discipline, setDiscipline] = useState('')

  // fight-tracking form
  const [fightLabel, setFightLabel] = useState('')
  const [fightUrl, setFightUrl] = useState('')
  const [fightMat, setFightMat] = useState('')
  const [fightNum, setFightNum] = useState('')

  const [emailDraft, setEmailDraft] = useState(emailConfig)
  const [emailSaved, setEmailSaved] = useState(false)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editMatchlistUrl, setEditMatchlistUrl] = useState('')
  const [editDiscipline, setEditDiscipline] = useState('')
  const [editMat, setEditMat] = useState('')
  const [editFightNum, setEditFightNum] = useState('')
  const [editTrackMode, setEditTrackMode] = useState(null)

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

  function handleFightSubmit(e) {
    e.preventDefault()
    const label = fightLabel.trim()
    const url = fightUrl.trim()
    const mat = fightMat.trim()
    const num = fightNum.trim()
    if (!label || !url || !mat || !num) return
    onAdd({ trackMode: 'fight', name: label, matchlistUrl: url, bracketUrl: url, mat, fightNum: num })
    setFightLabel('')
    setFightUrl('')
    setFightMat('')
    setFightNum('')
  }

  function startEdit(f) {
    setEditingId(f.id)
    setEditName(f.name)
    setEditMatchlistUrl(f.matchlistUrl || f.bracketUrl || '')
    setEditDiscipline(f.discipline || '')
    setEditTrackMode(f.trackMode || null)
    setEditMat(f.mat || '')
    setEditFightNum(f.fightNum || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditMatchlistUrl('')
    setEditDiscipline('')
    setEditTrackMode(null)
    setEditMat('')
    setEditFightNum('')
  }

  function handleEditSave(id) {
    const trimName = editName.trim()
    const trimUrl = editMatchlistUrl.trim()
    if (!trimName || !trimUrl) return
    if (editTrackMode === 'fight') {
      const mat = editMat.trim()
      const fightNum = editFightNum.trim()
      if (!mat || !fightNum) return
      onEdit(id, { trackMode: 'fight', name: trimName, bracketUrl: trimUrl, matchlistUrl: trimUrl, mat, fightNum })
    } else {
      onEdit(id, { name: trimName, bracketUrl: trimUrl, matchlistUrl: trimUrl, discipline: editDiscipline || null })
    }
    cancelEdit()
  }

  return (
    <div className="setup-panel">
      {/* ── Mode toggle ── */}
      <div className="add-fighter-form">
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className={addMode === 'fighter' ? 'btn-primary' : 'btn-ghost'}
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => setAddMode('fighter')}
          >
            Por luchador
          </button>
          <button
            type="button"
            className={addMode === 'fight' ? 'btn-primary' : 'btn-ghost'}
            style={{ flex: 1, fontSize: 13 }}
            onClick={() => setAddMode('fight')}
          >
            Por combate
          </button>
        </div>
      </div>

      {/* ── Add fighter form ── */}
      {addMode === 'fighter' && (
        <form className="add-fighter-form" onSubmit={handleSubmit} style={{ marginTop: 0 }}>
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
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={selectStyle}>
              <option value="">— Cualquiera —</option>
              <option value="gi">GI</option>
              <option value="nogi">No-Gi</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!name.trim() || !matchlistUrl.trim()}>
            + Agregar
          </button>
        </form>
      )}

      {/* ── Add fight-by-coords form ── */}
      {addMode === 'fight' && (
        <form className="add-fighter-form" onSubmit={handleFightSubmit} style={{ marginTop: 0 }}>
          <h2>Seguir combate</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            Seguí un combate por mat y número. Los participantes y horario se actualizan cuando estén definidos.
          </p>
          <div className="form-group">
            <label>Descripción</label>
            <input
              type="text"
              placeholder="Ej: Final GI -70kg"
              value={fightLabel}
              onChange={(e) => setFightLabel(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
            />
          </div>
          <div className="form-group">
            <label>URL del evento</label>
            <input
              type="url"
              placeholder="https://.../schedule/matchlist o bjjcompsystem.com/..."
              value={fightUrl}
              onChange={(e) => setFightUrl(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Mat</label>
              <input
                type="text"
                placeholder="Ej: 3"
                value={fightMat}
                onChange={(e) => setFightMat(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>N° combate</label>
              <input
                type="text"
                placeholder="Ej: 42"
                value={fightNum}
                onChange={(e) => setFightNum(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%' }}
            disabled={!fightLabel.trim() || !fightUrl.trim() || !fightMat.trim() || !fightNum.trim()}
          >
            + Agregar combate
          </button>
        </form>
      )}

      {/* ── List ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="fighter-list-header">Seguimientos ({fighters.length})</div>
          {fighters.length > 0 && (
            <button className="btn-danger" style={{ fontSize: 11, minHeight: 28, padding: '0 10px' }} onClick={onClearAll}>
              Limpiar todo
            </button>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} onClick={onShowScanner}>
              Escanear QR
            </button>
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} onClick={onShowQR}>
                Compartir enlace
              </button>
            )}
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12 }} onClick={copyWatchUrl}>
                {watchCopied ? '✓ Copiado' : '⌚ Watch URL'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input
              type="url"
              placeholder="Pegar enlace de importación…"
              value={pasteLink}
              onChange={(e) => { setPasteLink(e.target.value); setPasteSuccess(false) }}
              style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '8px 12px', outline: 'none' }}
            />
            <button
              className="btn-ghost"
              style={{ minHeight: 36, fontSize: 12, whiteSpace: 'nowrap' }}
              disabled={!pasteLink.trim()}
              onClick={() => {
                const count = onPasteImport(pasteLink)
                if (count > 0) { setPasteSuccess(true); setPasteLink('') }
              }}
            >
              {pasteSuccess ? '✓ Importado' : 'Importar'}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          {fighters.length === 0 ? (
            <div className="fighter-list-empty">
              No hay seguimientos aún.
            </div>
          ) : (
            <div className="fighter-list">
              {fighters.map((f) => (
                <div key={f.id} className="fighter-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                  {editingId === f.id ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 8 }}>
                        <label>Nombre / Descripción</label>
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
                        <label>URL</label>
                        <input
                          type="url"
                          value={editMatchlistUrl}
                          onChange={(e) => setEditMatchlistUrl(e.target.value)}
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                        />
                      </div>
                      {f.trackMode === 'fight' ? (
                        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>Mat</label>
                            <input type="text" value={editMat} onChange={(e) => setEditMat(e.target.value)} autoComplete="off" />
                          </div>
                          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>N° combate</label>
                            <input type="text" value={editFightNum} onChange={(e) => setEditFightNum(e.target.value)} autoComplete="off" />
                          </div>
                        </div>
                      ) : (
                        <div className="form-group" style={{ marginBottom: 8 }}>
                          <label>Disciplina</label>
                          <select value={editDiscipline} onChange={(e) => setEditDiscipline(e.target.value)} style={{ ...selectStyle, padding: '10px 14px' }}>
                            <option value="">— Cualquiera —</option>
                            <option value="gi">GI</option>
                            <option value="nogi">No-Gi</option>
                          </select>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleEditSave(f.id)} disabled={!editName.trim() || !editMatchlistUrl.trim()}>
                          Guardar
                        </button>
                        <button className="btn-ghost" onClick={cancelEdit}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="fighter-item-info">
                        <div className="fighter-item-name">
                          {f.name}
                          {f.trackMode === 'fight' && (
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                              Mat {f.mat} #{f.fightNum}
                            </span>
                          )}
                          {!f.trackMode && f.discipline && (
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                              ({f.discipline === 'gi' ? 'GI' : 'No-Gi'})
                            </span>
                          )}
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

      {/* ── EmailJS config ── */}
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
