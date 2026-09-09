import {
  verifyGoogleToken,
  getRedis,
  listUsers,
  setUserStatus,
  setUserTier,
  ADMIN_EMAIL,
  VALID_TIERS,
  TIER_DEFAULTS,
  normalizeMaxFighters,
  normalizeFeatures,
} from '../lib/serverAuth.js'

const CODES_KEY = 'cf:codes'

// Human-friendly one-time partner code, e.g. "CF-7Q4K-9XM2" (no ambiguous chars).
function generateCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-'
    s += alphabet[bytes[i] % alphabet.length]
  }
  return `CF-${s.slice(0, 4)}-${s.slice(5)}`
}

function parse(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

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

// POST { credential, action, ... } — admin-only (verified server-side).
//   action 'list'      → { users }
//   action 'setStatus' → { email, status: approved|pending|blocked }
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }

  // Verify the caller and enforce that they are the admin.
  let payload
  try {
    payload = await verifyGoogleToken(body.credential)
  } catch {
    return json({ error: 'Token inválido o expirado' }, 401)
  }
  if (String(payload.email).toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: 'No autorizado' }, 403)
  }

  try {
    const redis = getRedis()
    if (body.action === 'list') {
      return json({ ok: true, users: await listUsers(redis) })
    }
    if (body.action === 'setStatus') {
      const user = await setUserStatus(redis, body.email, body.status)
      return json({ ok: true, user })
    }
    // Manual tier assignment / quota override — callable any time.
    if (body.action === 'setUserTier') {
      const user = await setUserTier(redis, body.email, {
        tier: body.tier,
        maxFighters: body.maxFighters,
        features: body.features,
      })
      return json({ ok: true, user })
    }
    // Create a one-time partner code carrying a tier + quota + features.
    if (body.action === 'createCode') {
      if (!VALID_TIERS.includes(body.tier)) return json({ error: 'Invalid tier' }, 400)
      const tier = body.tier
      const code = generateCode()
      const record = {
        code,
        tier,
        maxFighters: normalizeMaxFighters(
          body.maxFighters === undefined || body.maxFighters === null || body.maxFighters === ''
            ? TIER_DEFAULTS[tier]
            : body.maxFighters,
          tier,
        ),
        features: normalizeFeatures(body.features),
        note: String(body.note || '').slice(0, 200),
        createdAt: Date.now(),
        createdBy: ADMIN_EMAIL,
        redeemedBy: null,
        redeemedAt: null,
      }
      await redis.hset(CODES_KEY, { [code]: JSON.stringify(record) })
      return json({ ok: true, code: record })
    }
    if (body.action === 'listCodes') {
      const all = await redis.hgetall(CODES_KEY)
      const codes = all ? Object.values(all).map(parse).filter(Boolean) : []
      codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return json({ ok: true, codes })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
