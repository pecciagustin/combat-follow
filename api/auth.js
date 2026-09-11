import { verifyGoogleToken, getRedis, recordLogin, joinPartner, getPartner } from '../lib/serverAuth.js'

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

// POST { credential } → verifies the Google token, records the login and
// returns the user's approval status. This is the source of truth for access.
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let credential, partnerToken
  try {
    ({ credential, partnerToken } = await req.json())
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }

  let payload
  try {
    payload = await verifyGoogleToken(credential)
  } catch {
    return json({ error: 'Token inválido o expirado' }, 401)
  }

  try {
    const redis = getRedis()
    let user = await recordLogin(redis, payload)

    // If they arrived through a partner link, auto-approve + scope them to that
    // event and hand the client the event so it can pre-load it. Unknown/inactive
    // tokens are ignored (they just log in as a normal pending user).
    let partner = null
    if (partnerToken) {
      const joined = await joinPartner(redis, user.email, partnerToken)
      if (joined) {
        user = joined.user
        partner = {
          eventId: joined.partner.eventId,
          eventName: joined.partner.eventName,
          matchlistUrl: joined.partner.matchlistUrl,
        }
      }
    }

    // For any scoped account (also on a fresh device / plain login), resolve the
    // partner event so the client can always pre-load it.
    if (!partner && user.scopedEventId && user.source?.token) {
      const p = await getPartner(redis, user.source.token)
      if (p) partner = { eventId: p.eventId, eventName: p.eventName, matchlistUrl: p.matchlistUrl }
    }

    return json({
      ok: true,
      status: user.status,
      isAdmin: user.isAdmin,
      tier: user.tier,
      maxFighters: user.maxFighters,
      features: user.features,
      scopedEventId: user.scopedEventId ?? null,
      partner,
      user: { email: user.email, name: user.name, picture: user.picture },
    })
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
