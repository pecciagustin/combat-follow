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

// Partner tiers. Each tier gives a DEFAULT fighter quota, but the quota lives on
// the account (maxFighters) so it can be overridden per partner. 'official' is
// effectively unlimited (a very high cap keeps the counting logic uniform).
export const VALID_TIERS = ['fighter', 'team', 'official']
export const TIER_DEFAULTS = { fighter: 1, team: 15, official: 100000 }
export const DEFAULT_FEATURES = { realtimeAlerts: false }

// Normalize whatever is stored/provided into a clean features object.
export function normalizeFeatures(features) {
  const src = features && typeof features === 'object' ? features : {}
  return { ...DEFAULT_FEATURES, realtimeAlerts: src.realtimeAlerts === true }
}

// Clamp maxFighters to a sane positive integer; fall back to the tier default.
export function normalizeMaxFighters(value, tier) {
  const n = Number(value)
  if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  return TIER_DEFAULTS[tier] ?? TIER_DEFAULTS.fighter
}

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

  // Tier fields: preserve whatever the account already has. New accounts start
  // as 'fighter'; the admin is bumped to 'official' so they never self-limit.
  const tier = existing?.tier || (isAdmin ? 'official' : 'fighter')
  const maxFighters = normalizeMaxFighters(
    existing?.maxFighters ?? TIER_DEFAULTS[tier],
    tier,
  )
  const features = normalizeFeatures(existing?.features)

  const record = {
    email,
    name: payload.name || existing?.name || '',
    picture: payload.picture || existing?.picture || '',
    sub: payload.sub || existing?.sub || '',
    status: isAdmin ? 'approved' : existing?.status || 'pending',
    tier,
    maxFighters,
    features,
    firstSeen: existing?.firstSeen || now,
    lastSeen: now,
    loginCount: (existing?.loginCount || 0) + 1,
  }

  await redis.hset(USERS_KEY, { [email]: JSON.stringify(record) })
  return { ...record, isAdmin }
}

// Throw if the account is missing or not approved. Used to gate data endpoints
// server-side (the SPA-side status gate is advisory only).
export async function requireApprovedUser(redis, payload) {
  const email = String(payload.email || '').toLowerCase()
  if (!email) throw new Error('No autorizado')
  const user = await getUser(redis, email)
  const isAdmin = email === ADMIN_EMAIL
  if (!user && !isAdmin) throw new Error('Cuenta no registrada')
  if (!isAdmin && user.status !== 'approved') throw new Error('Cuenta no aprobada')
  return { ...(user || { email }), isAdmin }
}

// Admin-driven tier assignment (and quota/feature override). Callable any time.
// Does NOT touch approval status — that stays a separate axis.
export async function setUserTier(redis, email, { tier, maxFighters, features } = {}) {
  if (!VALID_TIERS.includes(tier)) throw new Error('Invalid tier')
  const key = String(email).toLowerCase()
  const user = await getUser(redis, key)
  if (!user) throw new Error('User not found')
  user.tier = tier
  user.maxFighters = normalizeMaxFighters(
    maxFighters === undefined || maxFighters === null || maxFighters === ''
      ? TIER_DEFAULTS[tier]
      : maxFighters,
    tier,
  )
  user.features = normalizeFeatures(features ?? user.features)
  await redis.hset(USERS_KEY, { [key]: JSON.stringify(user) })
  return user
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
