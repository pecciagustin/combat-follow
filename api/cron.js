import { Redis } from '@upstash/redis'

export const config = { runtime: 'edge' }

const JINA_BASE = 'https://r.jina.ai/'

async function fetchJina(url) {
  const headers = { Accept: 'text/plain' }
  const key = process.env.VITE_JINA_API_KEY
  if (key && key !== 'none') headers['Authorization'] = `Bearer ${key}`
  const res = await fetch(JINA_BASE + url, { headers })
  if (!res.ok) throw new Error(`Jina ${res.status}`)
  return res.text()
}

function buildMatchlistUrl(bracketUrl, fighterName, manualUrl) {
  if (manualUrl) return manualUrl
  const m = bracketUrl.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  if (!m) return null
  const first = encodeURIComponent(fighterName.split(' ')[0].toLowerCase())
  return `${m[1]}/schedule/matchlist?search=${first}&club=&catid=0&mat=&country=`
}

function extractTime(text, fighterName, category) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()
  const contentStart = lines.findIndex(l => l.startsWith('Markdown Content'))
  const from = contentStart >= 0 ? contentStart : 0

  const idxs = lines.reduce((a, l, i) => {
    if (i > from && l.toLowerCase().includes(nameLower) && !l.startsWith('http') && !l.startsWith('*')) a.push(i)
    return a
  }, [])
  if (!idxs.length) return null

  let best = idxs[0]
  if (idxs.length > 1 && category) {
    const cat = category.toLowerCase()
    const isGi = /\bgi\b/.test(cat) && !/no.?gi/i.test(cat)
    const isNoGi = /no.?gi/i.test(cat)
    for (const idx of idxs) {
      const nearby = lines.slice(Math.max(0, idx - 10), idx).join(' ').toLowerCase()
      if (isNoGi && /no.?gi/i.test(nearby)) { best = idx; break }
      if (isGi && /\bgi\b/.test(nearby) && !/no.?gi/i.test(nearby)) { best = idx; break }
    }
  }

  const win = lines.slice(Math.max(0, best - 5), best + 3).join(' ')
  const times = [...win.matchAll(/\b([6-9]:\d{2}|[01]\d:\d{2}|2[0-3]:\d{2})\b/g)]
  return times.length ? times[times.length - 1][1] : null
}

function extractMatchRef(text, fighterName) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()
  const idxs = lines.reduce((a, l, i) => {
    if (l.toLowerCase().includes(nameLower) && !l.startsWith('http') && !l.startsWith('*') && !l.startsWith('!')) a.push(i)
    return a
  }, [])
  if (!idxs.length) return null
  const last = idxs[idxs.length - 1]
  for (let i = last; i >= Math.max(0, last - 10); i--) {
    const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) return `${m[1]}-${m[2]}`
  }
  return null
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
    const state = (prevState ? (typeof prevState === 'string' ? JSON.parse(prevState) : prevState) : {})
    const newState = { ...state }
    const log = []

    for (const fighter of fighters) {
      try {
        const bracketText = await fetchJina(fighter.bracketUrl)
        const matchRef = extractMatchRef(bracketText, fighter.name)

        const matchlistUrl = buildMatchlistUrl(fighter.bracketUrl, fighter.name, fighter.matchlistUrl)
        let time = null
        if (matchlistUrl) {
          const matchlistText = await fetchJina(matchlistUrl)
          // Extract category from bracket
          const catLine = bracketText.split('\n').map(l => l.trim()).find(l => {
            if (l.startsWith('*') || l.startsWith('[') || l.startsWith('!') || l.includes('http')) return false
            if (l.length > 100) return false
            return /\b(no.?gi|gi|white|blue|purple|brown|black|adult|master|juvenile)\b/i.test(l)
          })
          const category = catLine ? catLine.replace(/^#+\s*/, '').trim() : null
          time = extractTime(matchlistText, fighter.name, category)
        }

        const key = fighter.id
        const prev = state[key] || {}
        const changes = []

        if (prev.time && time && prev.time !== time)
          changes.push(`Hora: ${prev.time} → ${time}`)
        if (prev.matchRef && matchRef && prev.matchRef !== matchRef)
          changes.push(`Combate: ${prev.matchRef} → ${matchRef} (nuevo combate!)`)

        if (changes.length) {
          await sendEmail(emailConfig, fighter.name, changes.join('\n'))
          log.push(`${fighter.name}: ${changes.join(', ')}`)
        }

        newState[key] = { time, matchRef, updatedAt: Date.now() }
      } catch (e) {
        log.push(`${fighter.name}: error - ${e.message}`)
      }
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
