import { useState } from 'react'
import { IconPlus, IconPencil, IconTrash, IconWatch, IconClose, IconScan, IconShare } from './icons'

const selectStyle = { width: '100%', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, padding: '12px 14px', minHeight: 44, outline: 'none' }
const eventInputStyle = { flex: 1, background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, padding: '10px 12px', outline: 'none' }

// The match list URL now lives at the event level, so every fighter shares it.
function buildWatchUrl(fighters, eventUrl) {
  const minimal = fighters.map(f => ({
    name: f.name,
    url: eventUrl || '',
    ...(f.discipline ? { discipline: f.discipline } : {}),
    ...(f.trackMode === 'fight' ? { trackMode: 'fight', mat: f.mat, fightNum: f.fightNum } : {}),
  }))
  const encoded = btoa(JSON.stringify(minimal))
  return `https://combat-follow.vercel.app/api/watch?f=${encoded}`
}

export default function SetupPanel({ fighters, events = [], activeEventId, onSelectEvent, onCreateEvent, onRenameEvent, onDeleteEvent, onAdd, onRemove, onEdit, onShowQR, onShowScanner, onClearAll, onPasteImport }) {
  const [addMode, setAddMode] = useState('fighter') // 'fighter' | 'fight'
  const [pasteLink, setPasteLink] = useState('')
  const [pasteSuccess, setPasteSuccess] = useState(false)
  const [watchCopied, setWatchCopied] = useState(false)

  // event management
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [newEventUrl, setNewEventUrl] = useState('')
  const activeEvent = events.find((e) => e.id === activeEventId) || null

  function handleCreateEvent() {
    const name = newEventName.trim()
    const url = newEventUrl.trim()
    if (!name || !url) return
    onCreateEvent(name, url)
    setNewEventName('')
    setNewEventUrl('')
    setShowNewEvent(false)
  }

  function handleRenameEvent() {
    if (!activeEvent) return
    const name = window.prompt('Nuevo nombre del evento:', activeEvent.name)
    if (name && name.trim()) onRenameEvent(activeEvent.id, name.trim())
  }

  function copyWatchUrl() {
    const url = buildWatchUrl(fighters, activeEvent?.matchlistUrl)
    navigator.clipboard.writeText(url).then(() => {
      setWatchCopied(true)
      setTimeout(() => setWatchCopied(false), 2500)
    })
  }

  // fighter form
  const [name, setName] = useState('')
  const [discipline, setDiscipline] = useState('')

  // fight-tracking form
  const [fightLabel, setFightLabel] = useState('')
  const [fightMat, setFightMat] = useState('')
  const [fightNum, setFightNum] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDiscipline, setEditDiscipline] = useState('')
  const [editMat, setEditMat] = useState('')
  const [editFightNum, setEditFightNum] = useState('')
  const [editTrackMode, setEditTrackMode] = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    const trimName = name.trim()
    if (!trimName) return
    onAdd({ name: trimName, discipline: discipline || null })
    setName('')
    setDiscipline('')
  }

  function handleFightSubmit(e) {
    e.preventDefault()
    const label = fightLabel.trim()
    const mat = fightMat.trim()
    const num = fightNum.trim()
    if (!label || !mat || !num) return
    onAdd({ trackMode: 'fight', name: label, mat, fightNum: num })
    setFightLabel('')
    setFightMat('')
    setFightNum('')
  }

  function startEdit(f) {
    setEditingId(f.id)
    setEditName(f.name)
    setEditDiscipline(f.discipline || '')
    setEditTrackMode(f.trackMode || null)
    setEditMat(f.mat || '')
    setEditFightNum(f.fightNum || '')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setEditDiscipline('')
    setEditTrackMode(null)
    setEditMat('')
    setEditFightNum('')
  }

  function handleEditSave(id) {
    const trimName = editName.trim()
    if (!trimName) return
    if (editTrackMode === 'fight') {
      const mat = editMat.trim()
      const fightNum = editFightNum.trim()
      if (!mat || !fightNum) return
      onEdit(id, { trackMode: 'fight', name: trimName, mat, fightNum })
    } else {
      onEdit(id, { name: trimName, discipline: editDiscipline || null })
    }
    cancelEdit()
  }

  // ── Empty state: no events yet ──────────────────────────
  if (events.length === 0) {
    return (
      <div className="setup-panel">
        <form className="add-fighter-form event-empty" onSubmit={(e) => { e.preventDefault(); handleCreateEvent() }}>
          <h2>Creá tu primer evento</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            Un evento agrupa a tus luchadores y usa una sola match list. Después vas a poder agregar luchadores con solo el nombre.
          </p>
          <div className="form-group">
            <label htmlFor="new-event-name">Nombre del evento</label>
            <input
              id="new-event-name"
              type="text"
              placeholder="Ej: AJP Grand Slam Madrid"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
            />
          </div>
          <div className="form-group">
            <label htmlFor="new-event-url">Match list (URL)</label>
            <input
              id="new-event-url"
              type="url"
              placeholder="https://.../schedule/matchlist"
              value={newEventUrl}
              onChange={(e) => setNewEventUrl(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!newEventName.trim() || !newEventUrl.trim()}>
            Crear evento
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="setup-panel">
      {/* ── Event bar ── */}
      <div className="event-bar">
        <div className="event-bar-row">
          <select
            className="event-select"
            value={activeEventId || ''}
            onChange={(e) => onSelectEvent(e.target.value)}
            aria-label="Evento activo"
            style={{ flex: 1 }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <button className="btn-ghost" style={{ minHeight: 40, fontSize: 12, whiteSpace: 'nowrap', gap: 5 }} onClick={() => setShowNewEvent((v) => !v)}>
            <IconPlus size={14} /> Evento
          </button>
        </div>
        {activeEvent?.matchlistUrl && (
          <div className="event-matchlist" title={activeEvent.matchlistUrl}>
            Match list: {activeEvent.matchlistUrl}
          </div>
        )}
        {showNewEvent && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              placeholder="Nombre del evento…"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              autoFocus
              autoComplete="off"
              style={eventInputStyle}
            />
            <div className="event-bar-row">
              <input
                type="url"
                placeholder="Match list (URL)…"
                value={newEventUrl}
                onChange={(e) => setNewEventUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateEvent() }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                style={eventInputStyle}
              />
              <button className="btn-primary" style={{ minHeight: 40, fontSize: 12 }} disabled={!newEventName.trim() || !newEventUrl.trim()} onClick={handleCreateEvent}>
                Crear
              </button>
            </div>
          </div>
        )}
        {activeEvent && (
          <div className="event-bar-actions">
            <button className="btn-ghost" style={{ minHeight: 32, fontSize: 11, gap: 5 }} onClick={handleRenameEvent}>
              <IconPencil size={13} /> Renombrar
            </button>
            <button className="btn-danger" style={{ minHeight: 32, fontSize: 11, gap: 5 }} onClick={() => onDeleteEvent(activeEvent.id)}>
              <IconTrash size={13} /> Eliminar evento
            </button>
          </div>
        )}
      </div>

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
            <label>Disciplina <span style={{ color: 'var(--text-secondary)', fontWeight: 400, textTransform: 'none' }}>(si pelea en las dos)</span></label>
            <select value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={selectStyle}>
              <option value="">— Cualquiera —</option>
              <option value="gi">GI</option>
              <option value="nogi">No-Gi</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={!name.trim()}>
            + Agregar
          </button>
        </form>
      )}

      {/* ── Add fight-by-coords form ── */}
      {addMode === 'fight' && (
        <form className="add-fighter-form" onSubmit={handleFightSubmit} style={{ marginTop: 0 }}>
          <h2>Seguir combate</h2>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
            Seguí un combate por mat y número dentro de la match list del evento. Los participantes y horario se actualizan cuando estén definidos.
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
            disabled={!fightLabel.trim() || !fightMat.trim() || !fightNum.trim()}
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
            <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12, gap: 5 }} onClick={onShowScanner}>
              <IconScan size={13} /> Escanear QR
            </button>
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12, gap: 5 }} onClick={onShowQR}>
                <IconShare size={13} /> Compartir
              </button>
            )}
            {fighters.length > 0 && (
              <button className="btn-ghost" style={{ minHeight: 36, fontSize: 12, gap: 5 }} onClick={copyWatchUrl}>
                {watchCopied ? '✓ Copiado' : <><IconWatch size={13} /> Watch URL</>}
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
                        <button className="btn-primary" style={{ flex: 1 }} onClick={() => handleEditSave(f.id)} disabled={!editName.trim()}>
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
                      </div>
                      <button className="btn-ghost" onClick={() => startEdit(f)} aria-label={`Editar ${f.name}`}><IconPencil size={15} /></button>
                      <button className="btn-danger" onClick={() => onRemove(f.id)} aria-label={`Eliminar ${f.name}`}><IconClose size={15} /></button>
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
