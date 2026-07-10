const PROXY_BASE = '/api/fetch?url='

// Matchlist pages are server-side rendered and CORS-enabled — fetch directly from browser
// bjjcompsystem excluded: must go through server proxy to avoid mobile UA / Cloudflare issues
function isDirectFetchable(url) {
  return url.includes('/schedule/matchlist')
}

// ── BJJ Comp System parser (IBJJF) ────────────────────
// Fetched directly — server-side rendered, no Cloudflare issues
function parseBjjCompSystem(html, fighterName) {
  const nameLower = fighterName.toLowerCase()

  // Extract all fights with their data
  const fightBlocks = []
  const fightRe = /FIGHT\s+(\d+):<\/span>\s*Mat\s+(\d+)<\/div>\s*<div[^>]*>([^<]+)<\/div>/g
  let fm
  while ((fm = fightRe.exec(html)) !== null) {
    const fightNum = fm[1], mat = fm[2]
    const rawTime = fm[3].trim()
    const t = rawTime.match(/at\s+(\d+):(\d+)\s*(AM|PM)/i)
    let time = null
    if (t) {
      let h = parseInt(t[1])
      const period = t[3].toUpperCase()
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      time = `${String(h).padStart(2, '0')}:${t[2]}`
    }
    const blockStart = fm.index
    const blockEnd = fightRe.lastIndex + 1500
    const block = html.slice(blockStart, Math.min(html.length, blockEnd))
    const names = [...block.matchAll(/class='match-card__competitor-name'>([^<]+)</g)]
      .map(m => m[1].trim())
      .filter((n, i, arr) => arr.indexOf(n) === i)
    // Detect if fight is decided: loser gets 'match-competitor--loser' class
    const isDecided = block.includes('match-competitor--loser')
    fightBlocks.push({ fightNum, mat, time, names, isDecided })
  }

  // Find this fighter's fights (exclude "ghost" entries with 3+ names)
  const fighterFights = fightBlocks
    .filter(b => b.names.length <= 2 && b.names.some(n => n.toLowerCase().includes(nameLower)))
    .sort((a, b) => parseInt(a.fightNum) - parseInt(b.fightNum))

  if (!fighterFights.length) return null

  // Pick next fight: first undecided fight (chronological order)
  // If all decided (fighter won all), pick last one
  const undecided = fighterFights.filter(b => !b.isDecided)
  const best = undecided.length
    ? undecided[0]                              // next fight to happen
    : fighterFights[fighterFights.length - 1]  // all done, show last

  const opponent = best.names.find(n => !n.toLowerCase().includes(nameLower)) || null

  // Category from page title
  const catMatch = html.match(/tournament-category__title[^>]*>\s*([^<]+)/)
  const category = catMatch ? catMatch[1].trim() : null

  // Placement from results table
  let status = 'upcoming'
  const rankMatch = html.match(new RegExp(`<td>(\\d+)</td>\\s*<td><a[^>]*>${fighterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'))
  if (rankMatch) status = 'finished'

  return {
    time: best.time,
    mat: best.mat,
    fight: best.fightNum,
    opponent,
    category,
    status,
    fights: [],
  }
}

function fetchWithTimeout(input, init, ms = 10000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

async function fetchPageText(url, retries = 2) {
  if (isDirectFetchable(url)) {
    const res = await fetchWithTimeout(url, { credentials: 'omit', cache: 'no-store' }, 8000)
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return res.text()
  }
  // Non-matchlist: use Vercel proxy
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(PROXY_BASE + encodeURIComponent(url), {}, 12000)
      if (res.status === 429) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue }
        throw new Error('Proxy rate limited (429)')
      }
      if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status}`)
      const text = await res.text()
      if (text.includes('cf_chl_opt') || text.includes('Just a moment')) {
        throw new Error('Cloudflare: este evento requiere acceso directo al sitio')
      }
      return text
    } catch (err) {
      if (attempt < retries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      else throw err
    }
  }
}

// ── Matchlist HTML parser ─────────────────────────────
// AJP/Smoothcomp matchlist pages are server-side rendered and CORS-enabled.
// Structure per match: category-row div → number div (4-42) → eta div (13:38) → participant spans
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&aacute;/g, 'á').replace(/&Aacute;/g, 'Á')
    .replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É')
    .replace(/&iacute;/g, 'í').replace(/&Iacute;/g, 'Í')
    .replace(/&oacute;/g, 'ó').replace(/&Oacute;/g, 'Ó')
    .replace(/&uacute;/g, 'ú').replace(/&Uacute;/g, 'Ú')
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
}

function parseMatchlistHtml(html, fighterName, discipline) {
  const nameLower = fighterName.toLowerCase()

  const numbers      = [...html.matchAll(/<div class="number">([^<]+)<\/div>/g)].map(m => ({ pos: m.index, ref: m[1].trim() }))
  const etas         = [...html.matchAll(/class="eta[^"]*">(\d{1,2}:\d{2})<\/div>/g)].map(m => ({ pos: m.index, time: m[1] }))
  const runningPos   = [...html.matchAll(/class="eta[^"]*">Running<\/div>/gi)].map(m => m.index)
  const finishedPos  = [...html.matchAll(/class="eta[^"]*">Finished<\/div>/gi)].map(m => m.index)
  const participants = [...html.matchAll(/class="participant[^"]*">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, name: decodeHtmlEntities(m[1].trim()) }))
  const categories   = [...html.matchAll(/class="category-row">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, cat: m[1].trim() }))

  const fighterOccurrences = participants.filter(p => p.name.toLowerCase().includes(nameLower))
  if (!fighterOccurrences.length) return null

  // Filter by discipline (GI/NoGi) first if needed
  let candidates = fighterOccurrences
  if (fighterOccurrences.length > 1 && discipline) {
    const isNoGi = discipline === 'nogi'
    const isGi   = discipline === 'gi'
    const filtered = fighterOccurrences.filter(occ => {
      const nearCat = categories.filter(c => c.pos < occ.pos).pop()
      if (!nearCat) return false
      const c = nearCat.cat.toLowerCase()
      if (isNoGi) return /no.?gi/i.test(c)
      if (isGi)   return /\bgi\b/.test(c) && !/no.?gi/i.test(c)
      return true
    })
    if (filtered.length) candidates = filtered
  }

  // Among candidates: prefer the one with an upcoming ETA (time assigned)
  // If none have an ETA, take the LAST one (most advanced in tournament)
  // Priority: Running > has ETA (upcoming) > last match overall
  const isRunning = occ => {
    const nearNum = numbers.filter(n => n.pos < occ.pos).pop()
    return runningPos.some(p => p < occ.pos && p > (nearNum?.pos || 0))
  }
  const isFinished = occ => {
    const nearNum = numbers.filter(n => n.pos < occ.pos).pop()
    return finishedPos.some(p => p < occ.pos && p > (nearNum?.pos || 0))
  }
  const withRunning = candidates.filter(isRunning)
  const withEta = candidates.filter(occ => !isFinished(occ) && !isRunning(occ) && etas.some(e => e.pos < occ.pos && e.pos > (numbers.filter(n => n.pos < occ.pos).pop()?.pos || 0)))
  const best = withRunning.length
    ? withRunning[withRunning.length - 1]  // running match = highest priority
    : withEta.length
    ? withEta[0]                           // first upcoming match with time
    : candidates[candidates.length - 1]    // last match overall (most advanced)

  const nearNum     = numbers.filter(n => n.pos < best.pos).pop()
  const nearEta     = etas.filter(e => e.pos < best.pos).pop()
  const opponent    = participants
    .filter(p => p.pos > (nearNum?.pos || 0) && p.pos !== best.pos)
    .find(p => !p.name.toLowerCase().includes(nameLower))

  // Extract category from nearest category-row
  const nearCat = categories.filter(c => c.pos < best.pos).pop()

  const status = isRunning(best) ? 'live' : isFinished(best) ? 'finished' : 'upcoming'

  return {
    time:     nearEta?.time || (isRunning(best) ? 'En curso' : null),
    mat:      nearNum ? nearNum.ref.split('-')[0] : null,
    fight:    nearNum ? nearNum.ref.split('-')[1] : null,
    opponent: opponent?.name || null,
    category: nearCat?.cat?.replace(/\s*\(Day \d+\)/i, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim() || null,
    status,
  }
}

function deriveMatchlistUrl(fighter) {
  const firstName = encodeURIComponent(fighter.name.split(' ')[0].toLowerCase())
  const addSearch = url => `${url}?search=${firstName}&club=&catid=0&mat=&country=`

  if (fighter.matchlistUrl) {
    const url = fighter.matchlistUrl
    return url.includes('search=') ? url : addSearch(url.split('?')[0])
  }
  const url = fighter.bracketUrl || ''
  if (url.includes('/schedule/matchlist')) {
    return url.includes('search=') ? url : addSearch(url.split('?')[0])
  }
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  if (m) return addSearch(`${m[1]}/schedule/matchlist`)
  return url
}

function extractSmooothcompEventBase(url) {
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  return m ? m[1] : null
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(url, { credentials: 'omit', cache: 'no-store' }, 15000)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.json()
}

async function fetchSmooothcompEventData(eventBaseUrl) {
  // Get mat category ID, then mat IDs, then all matches per mat
  const categories = await fetchJson(`${eventBaseUrl}/schedule/new/matcategories.json`)
  const categoryId = categories?.[0]?.id
  if (!categoryId) throw new Error('No mat categories found')

  const mats = await fetchJson(`${eventBaseUrl}/schedule/new/mats.json/${categoryId}`)
  if (!mats?.length) throw new Error('No mats found')

  const matMatches = await Promise.all(
    mats.map(async (mat) => {
      try {
        const matches = await fetchJson(`${eventBaseUrl}/schedule/new/mat/${mat.id}/matches.json`)
        return { mat, matches }
      } catch {
        return null
      }
    })
  )
  return matMatches.filter(Boolean)
}

function findFightByCoordInSmooothcompData(matData, mat, fightNum) {
  const matStr = String(mat)
  const fightStr = String(fightNum)
  const fullRef = `${matStr}-${fightStr}`

  for (const { mat: matObj, matches } of matData) {
    for (const match of matches) {
      const matchRef = String(match.mat_match_nr || '')
      const matName = String(matObj.name || '')
      const refMatches = matchRef === fullRef ||
        (matchRef === fightStr && (matName === matStr || matName.includes(matStr)))
      if (!refMatches) continue

      const seats = match.seats || []
      const state = match.state || 'seeded'
      const isFinished = ['finished', 'decided', 'wo'].includes(state)
      const isRunning = state === 'running'

      let time = null
      if (match.estimated_start) {
        const d = new Date(match.estimated_start)
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }

      return {
        time,
        mat: matStr,
        fight: fightStr,
        fighters: seats.map(s => s.name).filter(Boolean),
        category: match.group || null,
        status: isRunning ? 'live' : isFinished ? 'finished' : 'upcoming',
      }
    }
  }
  return null
}

function findFighterInSmooothcompData(matData, fighterName, discipline) {
  const nameLower = fighterName.toLowerCase()
  const fighterMatches = []

  for (const { mat, matches } of matData) {
    for (const match of matches) {
      const group = match.group || ''
      // Filter by discipline if specified
      if (discipline === 'nogi' && !/no.?gi/i.test(group)) continue
      if (discipline === 'gi' && (/no.?gi/i.test(group) || !/\bgi\b/i.test(group))) continue

      const seats = match.seats || []
      const fighterSeat = seats.find(s => (s.name || '').toLowerCase().includes(nameLower))
      if (!fighterSeat) continue

      const opponent = seats.find(s => s !== fighterSeat)?.name || null
      const state = match.state || 'seeded'
      const isFinished = state === 'finished' || state === 'decided' || state === 'wo'
      const isRunning = state === 'running'

      let time = null
      if (match.estimated_start) {
        const d = new Date(match.estimated_start)
        time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }

      fighterMatches.push({
        time,
        mat: mat.name || null,
        fight: match.mat_match_nr || String(match.match_nr),
        opponent,
        category: group || null,
        status: isRunning ? 'live' : isFinished ? 'finished' : 'upcoming',
        isFinished,
        isRunning,
      })
    }
  }

  if (!fighterMatches.length) return null

  const running = fighterMatches.find(m => m.isRunning)
  if (running) return { ...running, fights: [] }
  const upcoming = fighterMatches.find(m => !m.isFinished)
  if (upcoming) return { ...upcoming, fights: [] }
  return { ...fighterMatches[fighterMatches.length - 1], status: 'finished', fights: [] }
}

// ── Fight-by-coordinates parser (AJP/Smoothcomp) ────────
// Finds a specific mat-fight slot (e.g. "3-42") and returns whoever is assigned + time
function parseFightByCoords(html, mat, fightNum) {
  const ref = `${mat}-${fightNum}`
  const numbers      = [...html.matchAll(/<div class="number">([^<]+)<\/div>/g)].map(m => ({ pos: m.index, ref: m[1].trim() }))
  const etas         = [...html.matchAll(/class="eta[^"]*">(\d{1,2}:\d{2})<\/div>/g)].map(m => ({ pos: m.index, time: m[1] }))
  const runningPos   = [...html.matchAll(/class="eta[^"]*">Running<\/div>/gi)].map(m => m.index)
  const finishedPos  = [...html.matchAll(/class="eta[^"]*">Finished<\/div>/gi)].map(m => m.index)
  const participants = [...html.matchAll(/class="participant[^"]*">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, name: m[1].trim() }))
  const categories   = [...html.matchAll(/class="category-row">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, cat: m[1].trim() }))

  const slot = numbers.find(n => n.ref === ref)
  if (!slot) return null

  const nextSlot = numbers.find(n => n.pos > slot.pos)
  const slotEnd = nextSlot?.pos ?? html.length

  const slotParticipants = participants.filter(p => p.pos > slot.pos && p.pos < slotEnd)
  const nearEta = etas.filter(e => e.pos > slot.pos && e.pos < slotEnd)[0]
    || etas.filter(e => e.pos < slot.pos).pop()

  const isRunning = runningPos.some(p => p > slot.pos && p < slotEnd)
  const isFinished = finishedPos.some(p => p > slot.pos && p < slotEnd)
  const nearCat = categories.filter(c => c.pos < slot.pos).pop()

  const status = isRunning ? 'live' : isFinished ? 'finished' : 'upcoming'

  return {
    time: nearEta?.time || (isRunning ? 'En curso' : null),
    mat,
    fight: fightNum,
    fighters: slotParticipants.map(p => p.name).filter(Boolean),
    category: nearCat?.cat?.replace(/\s*\(Day \d+\)/i, '').replace(/&#039;/g, "'").replace(/&amp;/g, '&').trim() || null,
    status,
  }
}

// ── Fight-by-coordinates parser (bjjcompsystem) ──────────
function parseBjjFightByCoords(html, mat, fightNum) {
  const fightRe = /FIGHT\s+(\d+):<\/span>\s*Mat\s+(\d+)<\/div>\s*<div[^>]*>([^<]+)<\/div>/g
  let fm
  while ((fm = fightRe.exec(html)) !== null) {
    if (fm[1] !== String(fightNum) || fm[2] !== String(mat)) continue

    const rawTime = fm[3].trim()
    const t = rawTime.match(/at\s+(\d+):(\d+)\s*(AM|PM)/i)
    let time = null
    if (t) {
      let h = parseInt(t[1])
      const period = t[3].toUpperCase()
      if (period === 'PM' && h !== 12) h += 12
      if (period === 'AM' && h === 12) h = 0
      time = `${String(h).padStart(2, '0')}:${t[2]}`
    }

    const blockStart = fm.index
    const nextFightMatch = html.slice(blockStart + 1).search(/FIGHT\s+\d+:<\/span>/)
    const blockEnd = nextFightMatch >= 0 ? blockStart + 1 + nextFightMatch : Math.min(html.length, blockStart + 1500)
    const block = html.slice(blockStart, blockEnd)
    const names = [...block.matchAll(/class='match-card__competitor-name'>([^<]+)</g)]
      .map(m => m[1].trim())
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .filter(n => !/winner of fight/i.test(n))

    const isDecided = block.includes('match-competitor--loser')
    const catMatch = html.match(/tournament-category__title[^>]*>\s*([^<]+)/)

    return {
      time,
      mat: String(mat),
      fight: String(fightNum),
      fighters: names,
      category: catMatch ? catMatch[1].trim() : null,
      status: isDecided ? 'finished' : time ? 'upcoming' : 'upcoming',
    }
  }
  return null
}

export async function scrapeAllFighters(fighters) {
  // Pre-fetch smoothcomp JSON API data once per unique event (bypasses Cloudflare)
  const smoothcompFighters = fighters.filter(f => {
    const url = f.matchlistUrl || f.bracketUrl || ''
    return !url.includes('bjjcompsystem.com') && url.match(/smoothcomp\.com/)
  })
  const eventBaseUrls = [...new Set(
    smoothcompFighters
      .map(f => extractSmooothcompEventBase(f.matchlistUrl || f.bracketUrl || ''))
      .filter(Boolean)
  )]
  const eventCache = {}
  await Promise.all(eventBaseUrls.map(async (baseUrl) => {
    try {
      eventCache[baseUrl] = await fetchSmooothcompEventData(baseUrl)
    } catch {
      eventCache[baseUrl] = null
    }
  }))

  const results = await Promise.all(fighters.map(async (fighter) => {
    try {
      const url = fighter.matchlistUrl || fighter.bracketUrl || ''

      // ── Fight-by-coordinates mode ──────────────────────
      if (fighter.trackMode === 'fight') {
        if (url.includes('bjjcompsystem.com')) {
          const html = await fetchPageText(url)
          const data = parseBjjFightByCoords(html, fighter.mat, fighter.fightNum)
          if (data) return { id: fighter.id, data: { ...data, trackMode: 'fight' }, error: null }
          return { id: fighter.id, data: { trackMode: 'fight', mat: fighter.mat, fight: fighter.fightNum, fighters: [], status: 'notfound' }, error: null }
        }
        if (url.match(/smoothcomp\.com/)) {
          const baseUrl = extractSmooothcompEventBase(url)
          const matData = baseUrl ? eventCache[baseUrl] : null
          if (!matData) throw new Error('No se pudo obtener datos del evento')
          const data = findFightByCoordInSmooothcompData(matData, fighter.mat, fighter.fightNum)
          if (data) return { id: fighter.id, data: { ...data, trackMode: 'fight' }, error: null }
          return { id: fighter.id, data: { trackMode: 'fight', mat: fighter.mat, fight: fighter.fightNum, fighters: [], status: 'notfound' }, error: null }
        }
        // AJP / other HTML
        const html = await fetchPageText(url)
        const data = parseFightByCoords(html, fighter.mat, fighter.fightNum)
        if (data) return { id: fighter.id, data: { ...data, trackMode: 'fight' }, error: null }
        return { id: fighter.id, data: { trackMode: 'fight', mat: fighter.mat, fight: fighter.fightNum, fighters: [], status: 'notfound' }, error: null }
      }

      // ── IBJJF (bjjcompsystem) ─────────────────────────
      if (url.includes('bjjcompsystem.com')) {
        const html = await fetchPageText(url)
        const data = parseBjjCompSystem(html, fighter.name)
        if (data && (data.time || data.mat)) return { id: fighter.id, data: { ...data, athlete: fighter.name }, error: null }
        return { id: fighter.id, data: { athlete: fighter.name, status: 'notfound', fights: [] }, error: null }
      }

      // ── Smoothcomp — JSON API (no Cloudflare) ─────────
      if (url.match(/smoothcomp\.com/)) {
        const baseUrl = extractSmooothcompEventBase(url)
        const renderResults = baseUrl ? eventCache[baseUrl] : null
        if (!renderResults) throw new Error('No se pudo obtener datos del evento')
        const data = findFighterInSmooothcompData(renderResults, fighter.name, fighter.discipline)
        if (data) return { id: fighter.id, data: { ...data, athlete: fighter.name }, error: null }
        return { id: fighter.id, data: { athlete: fighter.name, status: 'notfound', fights: [] }, error: null }
      }

      // ── AJP / other (HTML matchlist) ──────────────────
      const matchlistUrl = deriveMatchlistUrl(fighter)
      if (!matchlistUrl) throw new Error('No matchlist URL configured')
      const text = await fetchPageText(matchlistUrl)
      const data = parseMatchlistHtml(text, fighter.name, fighter.discipline)
      if (data && (data.time || data.mat)) return { id: fighter.id, data: { ...data, athlete: fighter.name, status: data.status || 'upcoming', fights: [] }, error: null }
      return { id: fighter.id, data: { athlete: fighter.name, status: 'notfound', fights: [] }, error: null }
    } catch (err) {
      return { id: fighter.id, data: null, error: err.message || 'Error fetching data' }
    }
  }))
  return results
}
