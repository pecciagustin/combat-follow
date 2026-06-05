import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' }
    })
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    const { fighters, emailConfig } = await req.json()
    await redis.set('cf:config', JSON.stringify({ fighters, emailConfig }))
    await redis.del('cf:state')

    return new Response(JSON.stringify({ ok: true, count: fighters.length }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
