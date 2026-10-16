import { Redis } from '@upstash/redis'
import {
  DORMANT_KEY, ALERT_TTL_SEC,
  parseJson, computeDormantUntil, loadDormant,
} from '../lib/cronSchedule.js'

export const config = { runtime: 'nodejs' }

const EVENT_DEADLINE_MS = 20000 // max wall time spent on a single event
const FAIL_BACKOFF_MS = 5 * 60000 // skip an event this long after it fails/times out

// ── Fetch helpers ─────────────────────────────────────
function fetchWithTimeout(url, opts = {}, ms = 8000, signal) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  // Timer stays armed until the body is read, so a stalled body can't hang the run.
  return fetch(url, { cache: 'no-store', signal: controller.signal, ...opts })
    .then(async (res) => { res._text = await res.text(); return res })
    .finally(() => clearTimeout(id))
}

async function fetchJson(url, signal) {
  const res = await fetchWithTimeout(url, {}, 8000, signal)
  if (!res.ok) throw new Error(`${res.status}`)
  return JSON.parse(res._text)
}

function extractEventBase(url) {
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  return m ? m[1] : null
}

// ── Smoothcomp JSON API (bypasses Cloudflare) ─────────
async function getSmoothcompMatData(eventBaseUrl, signal) {
  const categories = await fetchJson(`${eventBaseUrl}/schedule/new/matcategories.json`, signal)
  if (!categories?.length) throw new Error('No categories')
  const all = []
  await Promise.all(categories.map(async (cat) => {
    try {
      const mats = await fetchJson(`${eventBaseUrl}/schedule/new/mats.json/${cat.id}`, signal)
      if (!mats?.length) return
      const results = await Promise.all(
        mats.map(async (mat) => {
          try {
            const matches = await fetchJson(`${eventBaseUrl}/schedule/new/mat/${mat.id}/matches.json`, signal)
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
          return res._text
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

// Every match of an event, flattened to timings (for the dormancy decision).
function eventTimings(matData) {
  const out = []
  for (const { matches } of matData) for (const m of matches) out.push(timing(m))
  return out
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

    const [rawConfig, dormant] = await Promise.all([redis.get('cf:config'), loadDormant(redis, now)])
    const config = parseJson(rawConfig) || {}
    const fighters = Array.isArray(config.fighters) ? config.fighters : []
    const emailConfig = config.emailConfig
    const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
    if (!fighters.length) return json({ ok: true, idle: true, checked: 0, changes: [] })

    const tasks = fighters.map((fighter) => {
      const url = fighter.matchlistUrl || fighter.bracketUrl || ''
      const task = { fighter, url }
      if (isSmoothUrl(url)) {
        task.base = extractEventBase(url)
        task.dormKey = task.base ? `evt:${task.base}` : null
      } else if (url.includes('bjjcompsystem.com')) {
        task.dormKey = `bjj:${fighter.id}`
      }
      return task
    })

    // Early exit: drop everything whose event/fight is still far away (or failing).
    const live = tasks.filter((t) => !(t.dormKey && dormant[t.dormKey] > now))
    const checked = tasks.length
    if (!live.length) return json({ ok: true, idle: true, checked, changes: [] })

    const dormUpdates = {}
    const log = []
    const htmlCache = new Map()
    const byBase = new Map()
    const others = []
    for (const t of live) {
      if (t.base) {
        if (!byBase.has(t.base)) byBase.set(t.base, [])
        byBase.get(t.base).push(t)
      } else others.push(t)
    }

    async function processTask(task, smoothcompCache) {
      const { fighter } = task
      try {
        const data = await getFighterTiming(fighter, smoothcompCache, htmlCache)
        if (!data) { log.push(`${fighter.name}: sin combate`); return }
        if (!data.startMs || data.isFinished) return
        if (task.dormKey?.startsWith('bjj:')) {
          const until = computeDormantUntil([data], now)
          if (until) { dormUpdates[task.dormKey] = until; return }
        }
        const mins = Math.round((data.startMs - now) / 60000)
        if (mins < 0 || mins >= 10) return

        const alertKey = `cf:alerted:legacy:${fighter.id}-${data.ref || data.startMs}`
        const claimed = await redis.set(alertKey, 1, { nx: true, ex: ALERT_TTL_SEC })
        if (!claimed) return
        const hm = new Date(data.startMs).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
        try {
          await sendEmail(emailConfig, fighter.name, `⚡ Combate en ${mins} min — a las ${hm}${data.ref ? ` (combate ${data.ref})` : ''}`)
          log.push(`${fighter.name}: alerta ${mins} min`)
        } catch (err) {
          await redis.del(alertKey) // let the next run retry
          throw err
        }
      } catch (e) {
        log.push(`${fighter.name}: ${e.message}`)
      }
    }

    // Each event is fetched and processed independently with its own deadline,
    // so one slow/blocked event can't starve the others.
    await Promise.all([
      ...[...byBase.entries()].map(async ([base, eventTasks]) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), EVENT_DEADLINE_MS)
        let matData
        try {
          matData = await getSmoothcompMatData(base, controller.signal)
        } catch (e) {
          dormUpdates[`evt:${base}`] = now + FAIL_BACKOFF_MS
          log.push(`evento ${base}: ${controller.signal.aborted ? 'timeout' : e.message}`)
          return
        } finally { clearTimeout(timer) }
        const until = computeDormantUntil(eventTimings(matData), now)
        if (until) { dormUpdates[`evt:${base}`] = until; return }
        await Promise.all(eventTasks.map((t) => processTask(t, { [base]: matData })))
      }),
      ...others.map((t) => processTask(t, {})),
    ])

    if (Object.keys(dormUpdates).length) await redis.hset(DORMANT_KEY, dormUpdates)
    return json({ ok: true, checked, changes: log })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
}
