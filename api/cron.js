import { Redis } from '@upstash/redis'
import {
  DORMANT_KEY, TARGETS_KEY, TARGETS_TTL_SEC, ALERT_TTL_SEC,
  parseJson, computeDormantUntil, loadDormant,
} from '../lib/cronSchedule.js'

export const config = { runtime: 'nodejs' }

const PUSH_SUBS_KEY = 'cf:push-subs'
const FIGHTERS_PREFIX = 'cf:fighters:'
const TOURNAMENTS_PREFIX = 'cf:tournaments:'

let webpushPromise = null
// web-push is only loaded when there is actually something to send.
async function getWebPush() {
  if (!webpushPromise) {
    webpushPromise = import('web-push').then((m) => {
      const webpush = m.default || m
      const pub = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
      const priv = process.env.VAPID_PRIVATE_KEY
      if (!pub || !priv) return null
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@combatfollow.com', pub, priv)
      return webpush
    })
  }
  return webpushPromise
}

async function sendPushToUser(redis, webpush, subscriptions, title, body) {
  await Promise.allSettled(subscriptions.map(async ({ endpoint, sub }) => {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title, body, tag: 'fight-alert' }), { timeout: 5000 })
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await redis.hdel(PUSH_SUBS_KEY, endpoint)
      }
    }
  }))
}

// ── Fetch helpers ─────────────────────────────────────
function fetchWithTimeout(url, opts = {}, ms = 8000) {
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

async function getFighterTiming(fighter, smoothcompCache, htmlCache) {
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
    // One GET per URL per run, even if several fighters share the page.
    if (!htmlCache.has(url)) {
      htmlCache.set(url, fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }, 8000)
        .then((res) => {
          if (!res.ok) throw new Error(`Fetch ${res.status}`)
          return res.text()
        }))
    }
    const html = await htmlCache.get(url)
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

const isSmoothUrl = (u) => (/smoothcomp\.com/.test(u) || /ajptour\.com/.test(u)) && !u.includes('bjjcompsystem.com')
const parse = parseJson

// Every match of an event, flattened to timings (for the dormancy decision).
function eventTimings(matData) {
  const out = []
  for (const { matches } of matData) for (const m of matches) out.push(timing(m))
  return out
}

// Recipients: one entry per user with their active fighters resolved to an
// event URL. Cached in Redis (invalidated by the endpoints that change it).
async function loadPushTargets(redis) {
  const cached = parse(await redis.get(TARGETS_KEY))
  if (cached) return cached

  const allSubs = (await redis.hgetall(PUSH_SUBS_KEY)) || {}
  const byEmail = {}
  for (const [endpoint, raw] of Object.entries(allSubs)) {
    const record = parse(raw)
    if (!record?.email) continue
    ;(byEmail[record.email] ||= []).push({ endpoint, sub: record.subscription })
  }
  const emails = Object.keys(byEmail)
  const targets = []
  if (emails.length) {
    const pipe = redis.pipeline()
    for (const email of emails) {
      pipe.hgetall(`${FIGHTERS_PREFIX}${email}`)
      pipe.hgetall(`${TOURNAMENTS_PREFIX}${email}`)
    }
    const res = await pipe.exec()
    emails.forEach((email, i) => {
      const rawFighters = res[i * 2]
      const rawTournaments = res[i * 2 + 1]
      if (!rawFighters) return
      const eventUrls = {}
      for (const raw of Object.values(rawTournaments || {})) {
        const t = parse(raw)
        if (t?.id && t?.matchlistUrl) eventUrls[t.id] = t.matchlistUrl
      }
      const fighters = Object.values(rawFighters)
        .map(parse)
        .filter((f) => f && f.active !== false)
        .map((f) => ({ ...f, matchlistUrl: eventUrls[f.eventId] || '' }))
        .filter((f) => f.matchlistUrl)
      if (fighters.length) targets.push({ email, subs: byEmail[email], fighters })
    })
  }
  await redis.set(TARGETS_KEY, JSON.stringify(targets), { ex: TARGETS_TTL_SEC })
  return targets
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
    const now = Date.now()
    const pushConfigured = !!((process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY) && process.env.VAPID_PRIVATE_KEY)

    const [rawConfig, dormant, targets] = await Promise.all([
      redis.get('cf:config'),
      loadDormant(redis, now),
      pushConfigured ? loadPushTargets(redis) : [],
    ])
    const config = parse(rawConfig) || {}
    const legacyFighters = Array.isArray(config.fighters) ? config.fighters : []
    const emailConfig = config.emailConfig

    // Flatten everything to check into tasks.
    const tasks = []
    for (const f of legacyFighters) {
      tasks.push({ owner: 'legacy', fighter: f, url: f.matchlistUrl || f.bracketUrl || '' })
    }
    for (const t of targets) {
      for (const f of t.fighters) tasks.push({ owner: t.email, fighter: f, url: f.matchlistUrl, target: t })
    }
    for (const t of tasks) {
      if (isSmoothUrl(t.url)) {
        t.base = extractEventBase(t.url)
        t.dormKey = t.base ? `evt:${t.base}` : null
      } else if (t.url.includes('bjjcompsystem.com')) {
        t.dormKey = `bjj:${t.owner}:${t.fighter.id}`
      }
    }

    // Early exit: drop everything whose event/fight is still far away.
    let live = tasks.filter((t) => !(t.dormKey && dormant[t.dormKey] > now))
    const checked = tasks.length
    if (!live.length) {
      return new Response(JSON.stringify({ ok: true, idle: true, checked, changes: [], push: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const dormUpdates = {}
    const smoothcompCache = {}
    const htmlCache = new Map()
    const bases = [...new Set(live.map((t) => t.base).filter(Boolean))]
    await Promise.all(bases.map(async (b) => {
      try {
        smoothcompCache[b] = await getSmoothcompMatData(b)
        const until = computeDormantUntil(eventTimings(smoothcompCache[b]), now)
        if (until) dormUpdates[`evt:${b}`] = until
      } catch { smoothcompCache[b] = null }
    }))
    // Events found to be far from starting: nothing to alert this run.
    live = live.filter((t) => !(t.dormKey && dormUpdates[t.dormKey]))

    const log = []
    const pushLog = []
    let webpush = null

    await Promise.all(live.map(async (task) => {
      const { fighter, owner } = task
      try {
        const data = await getFighterTiming(fighter, smoothcompCache, htmlCache)
        if (!data) { if (owner === 'legacy') log.push(`${fighter.name}: sin combate`); return }
        if (!data.startMs || data.isFinished) return
        const mins = Math.round((data.startMs - now) / 60000)
        if (task.dormKey?.startsWith('bjj:')) {
          const until = computeDormantUntil([data], now)
          if (until) { dormUpdates[task.dormKey] = until; return }
        }
        if (mins < 0 || mins >= 10) return

        const alertKey = `cf:alerted:${owner}:${fighter.id}-${data.ref || data.startMs}`
        const claimed = await redis.set(alertKey, 1, { nx: true, ex: ALERT_TTL_SEC })
        if (!claimed) return
        const hm = new Date(data.startMs).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
        const refTxt = data.ref ? ` (combate ${data.ref})` : ''
        try {
          if (owner === 'legacy') {
            await sendEmail(emailConfig, fighter.name, `⚡ Combate en ${mins} min — a las ${hm}${refTxt}`)
            log.push(`${fighter.name}: alerta ${mins} min`)
          } else {
            webpush ||= await getWebPush()
            if (!webpush) return
            await sendPushToUser(redis, webpush, task.target.subs, fighter.name, `Combate en ${mins} min — a las ${hm}${refTxt}`)
            pushLog.push(`push:${owner}:${fighter.name}`)
          }
        } catch (err) {
          await redis.del(alertKey) // let the next run retry
          throw err
        }
      } catch (e) {
        if (owner === 'legacy') log.push(`${fighter.name}: ${e.message}`)
      }
    }))

    if (Object.keys(dormUpdates).length) await redis.hset(DORMANT_KEY, dormUpdates)

    return new Response(JSON.stringify({ ok: true, checked, changes: log, push: pushLog }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
