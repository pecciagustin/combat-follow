// Client helpers for the per-account authoritative fighter roster.
// The server enforces the per-event quota here — the UI is comfort only.
// All calls require the Google credential (JWT).

async function post(body) {
  const res = await fetch('/api/fighters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`)
    err.code = data.code // e.g. 'LIMIT_REACHED'
    err.used = data.used
    err.max = data.max
    throw err
  }
  return data
}

// Full roster with per-event `active` flags (read-only excess = active:false).
export async function listFighters(credential) {
  const data = await post({ credential, op: 'list' })
  return { fighters: data.fighters || [], maxFighters: data.maxFighters }
}

// Add a fighter to an event. Throws with err.code === 'LIMIT_REACHED' if full.
export async function addFighterRemote(credential, eventId, fighter) {
  const data = await post({ credential, op: 'add', eventId, fighter })
  return data.fighter
}

// Remove a fighter by id.
export async function removeFighterRemote(credential, id) {
  return post({ credential, op: 'remove', id })
}

// One-time seed of the server roster from local fighters (idempotent per event).
export async function migrateFighters(credential, fighters) {
  if (!fighters?.length) return { ok: true, seeded: 0 }
  return post({ credential, op: 'migrate', fighters })
}
