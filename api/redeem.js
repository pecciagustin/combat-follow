import { verifyGoogleToken, getRedis, applyTierToUser } from '../lib/serverAuth.js'

export const config = { runtime: 'edge' }

const CODES_KEY = 'cf:codes'

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

function parse(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// POST { credential, code } — a partner redeems a code. Applies its tier/quota/
// features to the caller's account and auto-approves it (a code is an invitation).
// Single-use: idempotent only for the same redeemer.
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

  const code = String(body.code || '').trim().toUpperCase()
  if (!code) return json({ error: 'Falta el código' }, 400)

  const email = String(payload.email).toLowerCase()

  try {
    const redis = getRedis()
    const record = parse(await redis.hget(CODES_KEY, code))
    if (!record) return json({ error: 'Código inválido' }, 404)
    if (record.redeemedBy && record.redeemedBy !== email) {
      return json({ error: 'Este código ya fue canjeado' }, 409)
    }

    const user = await applyTierToUser(redis, email, {
      tier: record.tier,
      maxFighters: record.maxFighters,
      features: record.features,
    })

    if (!record.redeemedBy) {
      record.redeemedBy = email
      record.redeemedAt = Date.now()
      await redis.hset(CODES_KEY, { [code]: JSON.stringify(record) })
    }

    return json({
      ok: true,
      status: user.status,
      tier: user.tier,
      maxFighters: user.maxFighters,
      features: user.features,
    })
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
