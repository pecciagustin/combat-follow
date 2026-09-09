import { Redis } from '@upstash/redis'
import { verifyGoogleToken, ADMIN_EMAIL } from '../lib/serverAuth.js'

export const config = { runtime: 'edge' }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid body' }, 400)
  }

  // Server-side email monitoring writes a single global config, so it is
  // restricted to the admin account (only they can drive the cron).
  let payload
  try {
    payload = await verifyGoogleToken(body.credential)
  } catch {
    return json({ error: 'Token inválido o expirado' }, 401)
  }
  if ((payload.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: 'No autorizado' }, 403)
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    const { fighters, emailConfig } = body
    await redis.set('cf:config', JSON.stringify({ fighters, emailConfig }))
    await redis.del('cf:state')

    return json({ ok: true, count: fighters.length })
  } catch (err) {
    return json({ error: err.message }, 500)
  }
}
