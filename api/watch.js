export const config = { runtime: 'edge' }

function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(url, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(id))
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

async function getMatData(eventBaseUrl) {
  const categories = await fetchJson(`${eventBaseUrl}/schedule/new/matcategories.json`)
  const categoryId = categories?.[0]?.id
  if (!categoryId) throw new Error('No categories')
  const mats = await fetchJson(`${eventBaseUrl}/schedule/new/mats.json/${categoryId}`)
  if (!mats?.length) throw new Error('No mats')
  const results = await Promise.all(
    mats.map(async (mat) => {
      try {
        const matches = await fetchJson(`${eventBaseUrl}/schedule/new/mat/${mat.id}/matches.json`)
        return { mat, matches: matches || [] }
      } catch { return null }
    })
  )
  return results.filter(Boolean)
}

function findFighter(matData, name, discipline) {
  const nameLower = name.toLowerCase()
  const all = []
  for (const { mat, matches } of matData) {
    for (const match of matches) {
      const group = match.group || ''
      if (discipline === 'nogi' && !/no.?gi/i.test(group)) continue
      if (discipline === 'gi' && (/no.?gi/i.test(group) || !/\bgi\b/i.test(group))) continue
      const seats = match.seats || []
      if (!seats.find(s => (s.name || '').toLowerCase().includes(nameLower))) continue
      const opponent = seats.find(s => !(s.name || '').toLowerCase().includes(nameLower))?.name || null
      const state = match.state || 'seeded'
      const isFinished = ['finished', 'decided', 'wo'].includes(state)
      const isRunning = state === 'running'
      let time = null
      if (match.estimated_start) {
        const d = new Date(match.estimated_start)
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      all.push({ time, mat: mat.name, fight: match.mat_match_nr, opponent, isFinished, isRunning, status: isRunning ? 'live' : isFinished ? 'finished' : 'upcoming' })
    }
  }
  if (!all.length) return null
  return all.find(m => m.isRunning) || all.find(m => !m.isFinished) || { ...all[all.length - 1], status: 'finished' }
}

function findFightByCoord(matData, mat, fightNum) {
  const matStr = String(mat), fightStr = String(fightNum), fullRef = `${matStr}-${fightStr}`
  for (const { mat: matObj, matches } of matData) {
    for (const match of matches) {
      const matchRef = String(match.mat_match_nr || '')
      const matName = String(matObj.name || '')
      if (matchRef !== fullRef && !(matchRef === fightStr && (matName === matStr || matName.includes(matStr)))) continue
      const seats = match.seats || []
      const state = match.state || 'seeded'
      const isFinished = ['finished', 'decided', 'wo'].includes(state)
      const isRunning = state === 'running'
      let time = null
      if (match.estimated_start) {
        const d = new Date(match.estimated_start)
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }
      return { fighters: seats.map(s => s.name).filter(Boolean), time, status: isRunning ? 'live' : isFinished ? 'finished' : 'upcoming' }
    }
  }
  return null
}

function formatFighterLine(fighter, matData) {
  if (fighter.trackMode === 'fight') {
    const label = `Final Mat ${fighter.mat} · #${fighter.fightNum}`
    const data = findFightByCoord(matData, fighter.mat, fighter.fightNum)
    if (!data) return `${label}\nCombate a definir`
    const names = data.fighters.join(' vs ') || 'A definir'
    const timeStr = data.status === 'live' ? '🔴 En vivo' : data.time ? `🕐 ${data.time}` : ''
    return `${label}\n${names}${timeStr ? '\n' + timeStr : ''}`
  }
  const data = findFighter(matData, fighter.name, fighter.discipline)
  if (!data) return `${fighter.name}\nSin combates`
  if (data.status === 'live') return `${fighter.name}\n🔴 En vivo${data.opponent ? ' vs ' + data.opponent : ''}`
  if (data.status === 'finished') return `${fighter.name}\nFinalizado`
  const parts = []
  if (data.time) parts.push(`🕐 ${data.time}`)
  if (data.mat) parts.push(`Mat ${data.mat}`)
  if (data.fight) parts.push(`#${data.fight}`)
  if (data.opponent) parts.push(`vs ${data.opponent}`)
  return `${fighter.name}\n${parts.join(' · ')}`
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url)
  const encoded = searchParams.get('f')
  if (!encoded) return new Response('Missing f parameter', { status: 400 })

  let fighters
  try {
    fighters = JSON.parse(atob(encoded))
  } catch {
    return new Response('Invalid f parameter', { status: 400 })
  }

  // Fetch event data once per unique smoothcomp event
  const eventCache = {}
  const baseUrls = [...new Set(
    fighters.filter(f => f.url?.match(/smoothcomp\.com/)).map(f => extractEventBase(f.url)).filter(Boolean)
  )]
  await Promise.all(baseUrls.map(async (baseUrl) => {
    try { eventCache[baseUrl] = await getMatData(baseUrl) }
    catch { eventCache[baseUrl] = null }
  }))

  const lines = fighters.map(fighter => {
    try {
      const url = fighter.url || ''
      if (url.match(/smoothcomp\.com/)) {
        const baseUrl = extractEventBase(url)
        const matData = baseUrl ? eventCache[baseUrl] : null
        if (!matData) return `${fighter.name || `Mat ${fighter.mat} · #${fighter.fightNum}`}\nError al obtener datos`
        return formatFighterLine(fighter, matData)
      }
      return `${fighter.name || fighter.fightNum}\nNo compatible con Watch aún`
    } catch (err) {
      return `${fighter.name || fighter.fightNum}\nError`
    }
  })

  const now = new Date()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const body = lines.join('\n\n') + `\n\n— Actualizado ${timeStr}`

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}
