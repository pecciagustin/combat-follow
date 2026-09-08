// Server-side auth helpers shared by /api/auth and /api/admin.
// Verifies Google ID tokens (signature + audience + issuer) and stores the
// user registry / approval status in Upstash Redis.
import { Redis } from '@upstash/redis'
import { createRemoteJWKSet, jwtVerify } from 'jose'

// The Google OAuth Client ID is public by design; env var overrides the default.
export const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  '840056261680-nj335hfqntma75a1r7cvid8n5fge8mqv.apps.googleusercontent.com'

// Whoever this is gets auto-approved and sees the admin panel.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'pecciagustin@gmail.com').toLowerCase()

const USERS_KEY = 'cf:users'
export const VALID_STATUSES = ['approved', 'pending', 'blocked']

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

// Verify a Google-issued ID token (JWT). Throws if invalid/expired.
export async function verifyGoogleToken(credential) {
  if (!credential || typeof credential !== 'string') throw new Error('Missing credential')
  const { payload } = await jwtVerify(credential, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: GOOGLE_CLIENT_ID,
  })
  if (!payload.email) throw new Error('Token has no email')
  if (payload.email_verified === false) throw new Error('Email not verified')
  return payload
}

export function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
}

function parseRecord(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

export async function getUser(redis, email) {
  const raw = await redis.hget(USERS_KEY, email.toLowerCase())
  return parseRecord(raw)
}

export async function listUsers(redis) {
  const all = await redis.hgetall(USERS_KEY)
  if (!all) return []
  return Object.values(all)
    .map(parseRecord)
    .filter(Boolean)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
}

// Upsert a user on login. Preserves an existing approval status; new users
// start as 'pending'. The admin email is always approved.
export async function recordLogin(redis, payload) {
  const email = String(payload.email).toLowerCase()
  const existing = await getUser(redis, email)
  const now = Date.now()
  const isAdmin = email === ADMIN_EMAIL

  const record = {
    email,
    name: payload.name || existing?.name || '',
    picture: payload.picture || existing?.picture || '',
    sub: payload.sub || existing?.sub || '',
    status: isAdmin ? 'approved' : existing?.status || 'pending',
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
    loginCount: (existing?.loginCount || 0) + 1,
  }

  await redis.hset(USERS_KEY, { [email]: JSON.stringify(record) })
  return { ...record, isAdmin }
}

export async function setUserStatus(redis, email, status) {
  if (!VALID_STATUSES.includes(status)) throw new Error('Invalid status')
  const key = String(email).toLowerCase()
  const user = await getUser(redis, key)
  if (!user) throw new Error('User not found')
  if (key === ADMIN_EMAIL) throw new Error('Cannot change the admin status')
  user.status = status
  await redis.hset(USERS_KEY, { [key]: JSON.stringify(user) })
  return user
}
