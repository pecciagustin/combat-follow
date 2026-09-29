import { verifyGoogleToken, getRedis, ADMIN_EMAIL } from '../lib/serverAuth.js'
import webpush from 'web-push'

export const config = { runtime: 'nodejs' }

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
    const { credential, email: targetEmail } = await req.json()
    const payload = await verifyGoogleToken(credential)
    if (String(payload.email).toLowerCase() !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: CORS })
    }

    const redis = getRedis()
    const allSubs = await redis.hgetall(PUSH_SUBS_KEY)
    if (!allSubs || Object.keys(allSubs).length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: 'No hay suscripciones push registradas' }), { headers: CORS })
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || `mailto:${ADMIN_EMAIL}`,
      process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )

    let sent = 0, failed = 0
    const entries = Object.entries(allSubs)

    await Promise.allSettled(entries.map(async ([endpoint, raw]) => {
      const record = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (targetEmail && record.email !== targetEmail.toLowerCase()) return

      try {
        await webpush.sendNotification(record.subscription, JSON.stringify({
          title: 'Combat Follow - Test',
          body: 'Las notificaciones push funcionan correctamente',
          tag: 'push-test',
        }))
        sent++
      } catch (err) {
        failed++
        if (err.statusCode === 410 || err.statusCode === 404) {
          await redis.hdel(PUSH_SUBS_KEY, endpoint)
        }
      }
    }))

    return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS })
  }
}
