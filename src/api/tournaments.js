// Client helpers for the per-user tournament archive (server-synced).
// All calls require the Google credential (JWT); callers handle errors.

async function post(body) {
  const res = await fetch('/api/tournaments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Error ${res.status}`)
  }
  return res.json()
}

// Fetch all tournaments saved under the user's account (newest first).
export async function listTournaments(credential) {
  const data = await post({ credential, op: 'list' })
  return data.tournaments || []
}

// Upsert an array of tournament snapshots. Upsert-only on the server.
export async function saveTournaments(credential, tournaments) {
  if (!tournaments?.length) return { ok: true, count: 0 }
  return post({ credential, op: 'save', tournaments })
}
