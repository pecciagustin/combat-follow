import { verifyGoogleToken, getRedis, requireApprovedUser } from '../lib/serverAuth.js'

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

function tkey(email) {
  return `cf:tournaments:${email.toLowerCase()}`
}

function parse(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// Per-user tournament archive (upsert-only).
// POST { credential, op: 'list' }                       → { ok, tournaments: [...] }
// POST { credential, op: 'save', tournaments: [...] }   → { ok, count }
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

  const email = payload.email
  const key = tkey(email)

  try {
    const redis = getRedis()

    // Only approved accounts may read/write their archive (server-side gate).
    try {
      await requireApprovedUser(redis, payload)
    } catch (err) {
      return json({ error: err.message || 'No autorizado' }, 403)
    }

    if (body.op === 'list') {
      const all = await redis.hgetall(key)
      const tournaments = all
        ? Object.values(all).map(parse).filter(Boolean)
        : []
      tournaments.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      return json({ ok: true, tournaments })
    }

    if (body.op === 'save') {
      const list = Array.isArray(body.tournaments) ? body.tournaments : []
      const entries = {}
      for (const t of list) {
        if (!t || !t.id) continue
        entries[t.id] = JSON.stringify(t)
      }
      if (Object.keys(entries).length > 0) await redis.hset(key, entries)
      return json({ ok: true, count: Object.keys(entries).length })
    }

    return json({ error: 'Unknown op' }, 400)
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
