import { Redis } from '@upstash/redis'
import webpush from 'web-push'

export const config = { runtime: 'nodejs' }

const PUSH_SUBS_KEY = 'cf:push-subs'
const FIGHTERS_PREFIX = 'cf:fighters:'

function initWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@combatfollow.com',
    pub,
    priv,
  )
  return true
}

async function sendPushToUser(redis, subscriptions, title, body) {
  await Promise.allSettled(subscriptions.map(async ({ endpoint, sub }) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, tag: 'fight-alert' }))
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await redis.hdel(PUSH_SUBS_KEY, endpoint)
      }
    }
  }))
}

// ── Fetch helpers ─────────────────────────────────────
function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(url, { cache: 'no-store', signal: controller.signal, ...opts })
    .finally(() => clearTimeout(id))
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

function extractEventBase(url) {
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  return m ? m[1] : null
}

// ── Smoothcomp JSON API (bypasses Cloudflare) ─────────
async function getSmoothcompMatData(eventBaseUrl) {
  const categories = await fetchJson(`${eventBaseUrl}/schedule/new/matcategories.json`)
  if (!categories?.length) throw new Error('No categories')
  const all = []
  await Promise.all(categories.map(async (cat) => {
    try {
      const mats = await fetchJson(`${eventBaseUrl}/schedule/new/mats.json/${cat.id}`)
      if (!mats?.length) return
      const results = await Promise.all(
        mats.map(async (mat) => {
          try {
            const matches = await fetchJson(`${eventBaseUrl}/schedule/new/mat/${mat.id}/matches.json`)
            return { mat, matches: matches || [] }
          } catch { return null }
        })
      )
      all.push(...results.filter(Boolean))
    } catch { /* skip unavailable category */ }
  }))
  if (!all.length) throw new Error('No mats')
  return all
}

function timing(match) {
  const state = match.state || 'seeded'
  return {
    ref: String(match.mat_match_nr || match.match_nr || ''),
    startMs: match.estimated_start ? new Date(match.estimated_start).getTime() : null,
    isFinished: ['finished', 'decided', 'wo'].includes(state),
    isRunning: state === 'running',
  }
}

function findFighterTiming(matData, name, discipline) {
  const nameLower = name.toLowerCase()
  const all = []
  for (const { matches } of matData) {
    for (const match of matches) {
      const group = match.group || ''
      if (discipline === 'nogi' && !/no.?gi/i.test(group)) continue
      if (discipline === 'gi' && (/no.?gi/i.test(group) || !/\bgi\b/i.test(group))) continue
      const seats = match.seats || []
      if (!seats.find((s) => (s.name || '').toLowerCase().includes(nameLower))) continue
      all.push(timing(match))
    }
  }
  if (!all.length) return null
  all.sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity))
  return all.find((m) => m.isRunning) || all.find((m) => !m.isFinished) || all[all.length - 1]
}

function findCoordTiming(matData, mat, fightNum) {
  const matStr = String(mat), fightStr = String(fightNum), fullRef = `${matStr}-${fightStr}`
  for (const { mat: matObj, matches } of matData) {
    for (const match of matches) {
      const matchRef = String(match.mat_match_nr || '')
      const matName = String(matObj.name || '')
      if (matchRef !== fullRef && !(matchRef === fightStr && (matName === matStr || matName.includes(matStr)))) continue
      return timing(match)
    }
  }
  return null
}

// ── bjjcompsystem (IBJJF) — server-side rendered, no Cloudflare ──
function parseBjjTiming(html, fighterName, mat, fightNum, byCoord) {
  const fightRe = /FIGHT\s+(\d+):<\/span>\s*Mat\s+(\d+)<\/div>\s*<div[^>]*>([^<]+)<\/div>/g
  const blocks = []
  let fm
  while ((fm = fightRe.exec(html)) !== null) {
    const fNum = fm[1], fMat = fm[2]
    const t = fm[3].trim().match(/at\s+(\d+):(\d+)\s*(AM|PM)/i)
    let startMs = null
    if (t) {
      let h = parseInt(t[1])
      const period = t[3].toUpperCase()
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      const d = new Date()
      d.setHours(h, parseInt(t[2]), 0, 0)
      startMs = d.getTime()
    }
    const blockStart = fm.index
    const block = html.slice(blockStart, Math.min(html.length, fightRe.lastIndex + 1500))
    const names = [...block.matchAll(/class='match-card__competitor-name'>([^<]+)</g)].map((m) => m[1].trim())
    const isFinished = block.includes('match-competitor--loser')
    blocks.push({ ref: `${fMat}-${fNum}`, fNum, fMat, startMs, isFinished, names })
  }
  if (byCoord) {
    const b = blocks.find((x) => x.fNum === String(fightNum) && x.fMat === String(mat))
    return b ? { ref: b.ref, startMs: b.startMs, isFinished: b.isFinished, isRunning: false } : null
  }
  const nl = fighterName.toLowerCase()
  const mine = blocks
    .filter((b) => b.names.length <= 2 && b.names.some((n) => n.toLowerCase().includes(nl)))
    .sort((a, b) => parseInt(a.fNum) - parseInt(b.fNum))
  if (!mine.length) return null
  const next = mine.find((b) => !b.isFinished) || mine[mine.length - 1]
  return { ref: next.ref, startMs: next.startMs, isFinished: next.isFinished, isRunning: false }
}

async function getFighterTiming(fighter, smoothcompCache) {
  const url = fighter.matchlistUrl || fighter.bracketUrl || ''
  if ((url.match(/smoothcomp\.com/) || url.match(/ajptour\.com/)) && !url.includes('bjjcompsystem.com')) {
    const base = extractEventBase(url)
    const matData = base ? smoothcompCache[base] : null
    if (!matData) throw new Error('sin datos del evento (JSON)')
    return fighter.trackMode === 'fight'
      ? findCoordTiming(matData, fighter.mat, fighter.fightNum)
      : findFighterTiming(matData, fighter.name, fighter.discipline)
  }
  if (url.includes('bjjcompsystem.com')) {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }, 12000)
    if (!res.ok) throw new Error(`Fetch ${res.status}`)
    const html = await res.text()
    return parseBjjTiming(html, fighter.name, fighter.mat, fighter.fightNum, fighter.trackMode === 'fight')
  }
  throw new Error('fuente no soportada en el cron')
}

async function sendEmail(emailConfig, fighterName, changes) {
  if (!emailConfig?.serviceId) return
  await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: emailConfig.serviceId,
      template_id: emailConfig.templateId,
      user_id: emailConfig.publicKey,
      template_params: {
        to_email: emailConfig.toEmail,
        fighter_name: fighterName,
        changes,
        time: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      },
    }),
  })
}

export default async function handler(req) {
  try {
    // Optional protection: if CRON_SECRET is set, require ?key= or Bearer token.
    const secret = process.env.CRON_SECRET
    if (secret) {
      const provided =
        new URL(req.url).searchParams.get('key') ||
        (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      if (provided !== secret) return new Response('Unauthorized', { status: 401 })
    }

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })

    const raw = await redis.get('cf:config')
    if (!raw) return new Response('No config', { status: 200 })

    const { fighters, emailConfig } = typeof raw === 'string' ? JSON.parse(raw) : raw
    const prevState = await redis.get('cf:state')
    const state = prevState ? (typeof prevState === 'string' ? JSON.parse(prevState) : prevState) : {}
    const newState = { ...state }
    const log = []

    // Pre-fetch smoothcomp event data once per event via JSON API.
    const bases = [...new Set(
      fighters
        .map((f) => f.matchlistUrl || f.bracketUrl || '')
        .filter((u) => (u.match(/smoothcomp\.com/) || u.match(/ajptour\.com/)) && !u.includes('bjjcompsystem.com'))
        .map(extractEventBase)
        .filter(Boolean)
    )]
    const smoothcompCache = {}
    await Promise.all(bases.map(async (b) => {
      try { smoothcompCache[b] = await getSmoothcompMatData(b) }
      catch { smoothcompCache[b] = null }
    }))

    const results = await Promise.all(fighters.map(async (fighter) => {
      try { return { fighter, data: await getFighterTiming(fighter, smoothcompCache) } }
      catch (e) { return { fighter, data: null, error: e.message } }
    }))

    const now = Date.now()
    for (const { fighter, data, error } of results) {
      if (error || !data) { log.push(`${fighter.name}: ${error || 'sin combate'}`); continue }
      const key = fighter.id
      const alertKey = `${key}-${data.ref || data.startMs}`

      if (data.startMs && !data.isFinished && !state[`alerted:${alertKey}`]) {
        const mins = Math.round((data.startMs - now) / 60000)
        if (mins >= 0 && mins < 10) {
          const hm = new Date(data.startMs).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
          await sendEmail(emailConfig, fighter.name, `⚡ Combate en ${mins} min — a las ${hm}${data.ref ? ` (combate ${data.ref})` : ''}`)
          newState[`alerted:${alertKey}`] = true
          log.push(`${fighter.name}: alerta ${mins} min`)
        }
      }
      newState[key] = { ref: data.ref, startMs: data.startMs, updatedAt: now }
    }

    await redis.set('cf:state', JSON.stringify(newState))

    // ── Per-user push notifications ──────────────────────
    const pushLog = []
    const pushEnabled = initWebPush()
    if (pushEnabled) {
      const allSubs = await redis.hgetall(PUSH_SUBS_KEY)
      if (allSubs && Object.keys(allSubs).length > 0) {
        const byEmail = {}
        for (const [endpoint, raw] of Object.entries(allSubs)) {
          const record = typeof raw === 'string' ? JSON.parse(raw) : raw
          if (!byEmail[record.email]) byEmail[record.email] = []
          byEmail[record.email].push({ endpoint, sub: record.subscription })
        }

        const pushState = await redis.get('cf:push-state')
        const pState = pushState ? (typeof pushState === 'string' ? JSON.parse(pushState) : pushState) : {}
        const newPState = { ...pState }

        for (const [email, subs] of Object.entries(byEmail)) {
          const rawFighters = await redis.hgetall(`${FIGHTERS_PREFIX}${email}`)
          if (!rawFighters) continue

          // Load the user's tournaments to resolve matchlistUrl per eventId
          const rawTournaments = await redis.hgetall(`cf:tournaments:${email}`)
          const eventUrls = {}
          if (rawTournaments) {
            for (const raw of Object.values(rawTournaments)) {
              const t = typeof raw === 'string' ? JSON.parse(raw) : raw
              if (t?.id && t?.matchlistUrl) eventUrls[t.id] = t.matchlistUrl
            }
          }

          const userFighters = Object.values(rawFighters)
            .map((r) => typeof r === 'string' ? JSON.parse(r) : r)
            .filter((f) => f.active !== false)
            .map((f) => ({ ...f, matchlistUrl: eventUrls[f.eventId] || '' }))
            .filter((f) => f.matchlistUrl)

          // Ensure smoothcomp data is cached for these fighters' events
          const userBases = [...new Set(
            userFighters
              .map((f) => f.matchlistUrl)
              .filter((u) => (u.match(/smoothcomp\.com/) || u.match(/ajptour\.com/)) && !u.includes('bjjcompsystem.com'))
              .map(extractEventBase)
              .filter((b) => b && !smoothcompCache[b])
          )]
          await Promise.all(userBases.map(async (b) => {
            try { smoothcompCache[b] = await getSmoothcompMatData(b) }
            catch { smoothcompCache[b] = null }
          }))

          for (const fighter of userFighters) {
            try {
              const data = await getFighterTiming(fighter, smoothcompCache)
              if (!data || !data.startMs || data.isFinished) continue
              const alertKey = `${email}:${fighter.id}-${data.ref || data.startMs}`
              if (pState[`alerted:${alertKey}`]) continue
              const mins = Math.round((data.startMs - now) / 60000)
              if (mins >= 0 && mins < 10) {
                const hm = new Date(data.startMs).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                const msg = `Combate en ${mins} min — a las ${hm}${data.ref ? ` (combate ${data.ref})` : ''}`
                await sendPushToUser(redis, subs, fighter.name, msg)
                newPState[`alerted:${alertKey}`] = true
                pushLog.push(`push:${email}:${fighter.name}`)
              }
            } catch { /* skip fighter on error */ }
          }
        }
        await redis.set('cf:push-state', JSON.stringify(newPState))
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: fighters.length, changes: log, push: pushLog }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
