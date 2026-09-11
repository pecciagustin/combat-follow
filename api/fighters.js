import {
  verifyGoogleToken,
  getRedis,
  getUser,
  requireApprovedUser,
  ADMIN_EMAIL,
  TIER_DEFAULTS,
} from '../lib/serverAuth.js'

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function rosterKey(email) {
  return `cf:fighters:${email.toLowerCase()}`
}
function migratedKey(email) {
  return `cf:fighters-migrated:${email.toLowerCase()}`
}

function parse(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// Keep only the fields we persist for a fighter (never trust extra client keys).
function sanitizeFighter(f) {
  if (!f || typeof f !== 'object') return null
  const out = {}
  if (f.trackMode === 'fight') {
    out.trackMode = 'fight'
    out.name = String(f.name || '').slice(0, 120)
    out.mat = f.mat ?? null
    out.fightNum = f.fightNum ?? null
  } else {
    out.name = String(f.name || '').slice(0, 120)
    if (f.discipline) out.discipline = f.discipline
  }
  if (f.note) out.note = String(f.note).slice(0, 500)
  return out.name ? out : null
}

// Dedupe identity for migration: same event + same tracked target.
function identity(f) {
  return [f.eventId, f.trackMode || 'name', (f.name || '').toLowerCase(), f.mat ?? '', f.fightNum ?? ''].join('|')
}

// Read the full roster as an array of fighter records.
async function readRoster(redis, email) {
  const all = await redis.hgetall(rosterKey(email))
  if (!all) return []
  return Object.values(all).map(parse).filter(Boolean)
}

// Count fighters (active + read-only excess) in one event.
function countInEvent(roster, eventId) {
  return roster.filter((f) => f.eventId === eventId).length
}

// Compute the per-event `active` flag: the first `maxFighters` fighters of each
// event ordered by addedAt asc are active; the rest are read-only excess.
function withActiveFlags(roster, maxFighters) {
  const byEvent = new Map()
  for (const f of roster) {
    if (!byEvent.has(f.eventId)) byEvent.set(f.eventId, [])
    byEvent.get(f.eventId).push(f)
  }
  const result = []
  for (const list of byEvent.values()) {
    list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0) || String(a.id).localeCompare(String(b.id)))
    list.forEach((f, i) => result.push({ ...f, active: i < maxFighters }))
  }
  return result
}

async function getMaxFighters(redis, email, isAdmin) {
  const user = await getUser(redis, email)
  if (user && Number.isFinite(Number(user.maxFighters))) return Number(user.maxFighters)
  return isAdmin ? TIER_DEFAULTS.official : TIER_DEFAULTS.fighter
}

// Per-account authoritative fighter roster. This is where the quota is ENFORCED.
// POST { credential, op } with:
//   op 'list'                          → { ok, fighters:[...with active], maxFighters }
//   op 'add'    { eventId, fighter }   → { ok, fighter } | 403 LIMIT_REACHED
//   op 'remove' { id }                 → { ok }
//   op 'migrate'{ fighters:[...] }     → { ok, seeded } (one-time seed per event)
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }

  let payload
  try {
    payload = await verifyGoogleToken(body.credential)
  } catch {
    return json({ error: 'Token inválido o expirado' }, 401)
  }

  const redis = getRedis()

  // Gate every op on approval (closes the pre-existing status hole).
  let me
  try {
    me = await requireApprovedUser(redis, payload)
  } catch (err) {
    return json({ error: err.message || 'No autorizado' }, 403)
  }

  const email = String(payload.email).toLowerCase()
  const isAdmin = email === ADMIN_EMAIL
  const key = rosterKey(email)

  try {
    if (body.op === 'list') {
      const roster = await readRoster(redis, email)
      const max = await getMaxFighters(redis, email, isAdmin)
      return json({ ok: true, fighters: withActiveFlags(roster, max), maxFighters: max })
    }

    if (body.op === 'add') {
      const eventId = body.eventId
      if (!eventId) return json({ error: 'Missing eventId' }, 400)
      // Partner-scoped accounts may only touch their one allowed event.
      if (me.scopedEventId && eventId !== me.scopedEventId) {
        return json({ error: 'Evento no permitido para esta cuenta', code: 'EVENT_NOT_ALLOWED' }, 403)
      }
      const clean = sanitizeFighter(body.fighter)
      if (!clean) return json({ error: 'Invalid fighter' }, 400)

      const roster = await readRoster(redis, email)
      const max = await getMaxFighters(redis, email, isAdmin)
      const used = countInEvent(roster, eventId)
      if (used >= max) {
        return json({ error: 'Límite de peleadores alcanzado', code: 'LIMIT_REACHED', used, max }, 403)
      }

      const fighter = {
        id: crypto.randomUUID(),
        eventId,
        ...clean,
        addedAt: Date.now(),
      }
      await redis.hset(key, { [fighter.id]: JSON.stringify(fighter) })
      return json({ ok: true, fighter: { ...fighter, active: true }, used: used + 1, max })
    }

    if (body.op === 'remove') {
      if (!body.id) return json({ error: 'Missing id' }, 400)
      await redis.hdel(key, String(body.id))
      return json({ ok: true })
    }

    if (body.op === 'migrate') {
      const incoming = Array.isArray(body.fighters) ? body.fighters : []
      if (incoming.length === 0) return json({ ok: true, seeded: 0 })

      // Only seed events we have never migrated for this account.
      const migratedRaw = (await redis.hgetall(migratedKey(email))) || {}
      const alreadyMigrated = new Set(Object.keys(migratedRaw))
      const existing = await readRoster(redis, email)
      const existingIdentities = new Set(existing.map(identity))

      const entries = {}
      const seededEvents = new Set()
      const seenIncoming = new Set()
      let order = 0
      for (const raw of incoming) {
        const eventId = raw?.eventId
        if (!eventId || alreadyMigrated.has(eventId)) continue
        const clean = sanitizeFighter(raw)
        if (!clean) continue
        const rec = { eventId, ...clean }
        const idn = identity(rec)
        if (existingIdentities.has(idn) || seenIncoming.has(idn)) continue
        seenIncoming.add(idn)
        // Preserve the local id so the client's matchMap/notes stay attached.
        const id = typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID()
        // Preserve local ordering via a monotonic addedAt.
        entries[id] = JSON.stringify({ id, ...rec, addedAt: (raw.addedAt || Date.now()) + order++ })
        seededEvents.add(eventId)
      }

      if (Object.keys(entries).length > 0) await redis.hset(key, entries)
      if (seededEvents.size > 0) {
        const marks = {}
        for (const ev of seededEvents) marks[ev] = 1
        await redis.hset(migratedKey(email), marks)
      }
      return json({ ok: true, seeded: Object.keys(entries).length })
    }

    return json({ error: 'Unknown op' }, 400)
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
