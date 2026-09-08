import { verifyGoogleToken, getRedis, recordLogin } from '../lib/serverAuth.js'

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

  let credential
  try {
    ({ credential } = await req.json())
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
    const user = await recordLogin(redis, payload)
    return json({
      ok: true,
      status: user.status,
      isAdmin: user.isAdmin,
      user: { email: user.email, name: user.name, picture: user.picture },
    })
  } catch (err) {
    return json({ error: err.message || 'Server error' }, 500)
  }
}
