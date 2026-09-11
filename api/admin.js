import {
  verifyGoogleToken,
  getRedis,
  listUsers,
  setUserStatus,
  setUserTier,
  setUserScope,
  createPartner,
  listPartners,
  setPartnerActive,
  listPartnerMembers,
  ADMIN_EMAIL,
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
    // Lift/set an account's event scope (null clears it → full account).
    if (body.action === 'setUserScope') {
      const user = await setUserScope(redis, body.email, body.scopedEventId ?? null)
      return json({ ok: true, user })
    }

    // ── Tech-partner links ──
    if (body.action === 'createPartner') {
      const partner = await createPartner(redis, {
        eventName: body.eventName,
        matchlistUrl: body.matchlistUrl,
        maxFighters: body.maxFighters,
        note: body.note,
        createdBy: payload.email,
      })
      return json({ ok: true, partner })
    }
    if (body.action === 'listPartners') {
      return json({ ok: true, partners: await listPartners(redis) })
    }
    if (body.action === 'setPartnerActive') {
      const partner = await setPartnerActive(redis, body.token, body.active)
      return json({ ok: true, partner })
    }
    if (body.action === 'listPartnerMembers') {
      return json({ ok: true, members: await listPartnerMembers(redis, body.token) })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
