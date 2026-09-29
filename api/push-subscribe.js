import { verifyGoogleToken, requireApprovedUser, getRedis } from '../lib/serverAuth.js'

export const config = { runtime: 'edge' }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const PUSH_SUBS_KEY = 'cf:push-subs'

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS })

  try {
    const { credential, op, subscription, endpoint } = await req.json()
    const payload = await verifyGoogleToken(credential)
    const redis = getRedis()
    await requireApprovedUser(redis, payload)
    const email = String(payload.email).toLowerCase()

    if (op === 'remove') {
      if (!endpoint) throw new Error('Missing endpoint')
      await redis.hdel(PUSH_SUBS_KEY, endpoint)
      return new Response(JSON.stringify({ ok: true, removed: true }), { headers: CORS })
    }

    if (!subscription?.endpoint) throw new Error('Missing subscription')
    await redis.hset(PUSH_SUBS_KEY, {
      [subscription.endpoint]: JSON.stringify({ email, subscription, createdAt: Date.now() }),
    })
    return new Response(JSON.stringify({ ok: true, registered: true }), { headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: CORS })
  }
}
