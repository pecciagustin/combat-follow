import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

// Same logic as client-side scraper — direct fetch for matchlist (no Jina)
function deriveMatchlistUrl(fighter) {
  if (fighter.matchlistUrl) return fighter.matchlistUrl
  const url = fighter.bracketUrl || ''
  if (url.includes('/schedule/matchlist')) return url
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  if (m) {
    const firstName = encodeURIComponent(fighter.name.split(' ')[0].toLowerCase())
    return `${m[1]}/schedule/matchlist?search=${firstName}&club=&catid=0&mat=&country=`
  }
  return url
}

async function fetchMatchlist(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } })
  if (!res.ok) throw new Error(`Fetch ${res.status}`)
  return res.text()
}

function parseMatchlist(html, fighterName, discipline) {
  const nameLower = fighterName.toLowerCase()
  const numbers      = [...html.matchAll(/<div class="number">([^<]+)<\/div>/g)].map(m => ({ pos: m.index, ref: m[1].trim() }))
  const etas         = [...html.matchAll(/class="eta[^"]*">(\d{1,2}:\d{2})<\/div>/g)].map(m => ({ pos: m.index, time: m[1] }))
  const participants = [...html.matchAll(/class="participant[^"]*">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, name: m[1].trim() }))
  const categories   = [...html.matchAll(/class="category-row">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, cat: m[1].trim() }))

  const occurrences = participants.filter(p => p.name.toLowerCase().includes(nameLower))
  if (!occurrences.length) return null

  let best = occurrences[0]
  if (occurrences.length > 1 && discipline) {
    const isNoGi = discipline === 'nogi'
    const isGi = discipline === 'gi'
    for (const occ of occurrences) {
      const nearCat = categories.filter(c => c.pos < occ.pos).pop()
      if (!nearCat) continue
      const c = nearCat.cat.toLowerCase()
      if (isNoGi && /no.?gi/i.test(c)) { best = occ; break }
      if (isGi && /\bgi\b/.test(c) && !/no.?gi/i.test(c)) { best = occ; break }
    }
  }

  const nearNum = numbers.filter(n => n.pos < best.pos).pop()
  const nearEta = etas.filter(e => e.pos < best.pos).pop()
  return {
    time: nearEta?.time || null,
    matchRef: nearNum?.ref || null,
  }
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

    // Fetch all fighters in parallel — same as client-side
    const fighterResults = await Promise.all(fighters.map(async (fighter) => {
      try {
        const matchlistUrl = deriveMatchlistUrl(fighter)
        if (!matchlistUrl) return { fighter, error: 'no URL' }
        const html = await fetchMatchlist(matchlistUrl)
        const data = parseMatchlist(html, fighter.name, fighter.discipline)
        return { fighter, data, error: data ? null : 'not found' }
      } catch (e) {
        return { fighter, data: null, error: e.message }
      }
    }))

    for (const { fighter, data, error } of fighterResults) {
      if (error || !data) { log.push(`${fighter.name}: ${error}`); continue }

      const { time, matchRef } = data
      const key = fighter.id
      const prev = state[key] || {}
      const changes = []

      if (prev.matchRef && matchRef && prev.matchRef !== matchRef)
        changes.push(`Nuevo combate: ${prev.matchRef} → ${matchRef}`)

      if (prev.time && time && prev.time !== time)
        changes.push(`Hora: ${prev.time} → ${time}`)

      const alertKey = `${key}-${matchRef || time}`
      if (time && !state[`alerted:${alertKey}`]) {
        const [h, m] = time.split(':').map(Number)
        const now = new Date()
        const fight = new Date(now)
        fight.setHours(h, m, 0, 0)
        const mins = Math.round((fight - now) / 60000)
        if (mins >= 0 && mins < 10) {
          changes.push(`⚡ COMBATE EN MENOS DE 10 MIN — a las ${time}`)
          newState[`alerted:${alertKey}`] = true
        }
      }

      if (changes.length) {
        await sendEmail(emailConfig, fighter.name, changes.join('\n'))
        log.push(`${fighter.name}: ${changes.join(', ')}`)
      }

      newState[key] = { time, matchRef, updatedAt: Date.now() }
    }

    await redis.set('cf:state', JSON.stringify(newState))
    return new Response(JSON.stringify({ ok: true, checked: fighters.length, changes: log }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }
}
