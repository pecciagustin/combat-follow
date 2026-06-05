const PROXY_BASE = '/api/fetch?url='

// Matchlist pages support CORS — fetch directly from browser, no proxy/Jina needed
function isDirectFetchable(url) {
  return url.includes('/schedule/matchlist')
}

async function fetchPageText(url, retries = 3) {
  if (isDirectFetchable(url)) {
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return res.text()
  }
  // Non-matchlist pages: use proxy (Jina) — currently only needed for bracket pages
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(PROXY_BASE + encodeURIComponent(url))
    if (res.status === 429) {
      if (attempt < retries) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue }
      throw new Error('Jina fetch failed: 429')
    }
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
    return res.text()
  }
}

// ── Matchlist HTML parser ─────────────────────────────
// AJP/Smoothcomp matchlist pages are server-side rendered and CORS-enabled.
// Structure per match: category-row div → number div (4-42) → eta div (13:38) → participant spans
function parseMatchlistHtml(html, fighterName, discipline) {
  const nameLower = fighterName.toLowerCase()

  const numbers      = [...html.matchAll(/<div class="number">([^<]+)<\/div>/g)].map(m => ({ pos: m.index, ref: m[1].trim() }))
  const etas         = [...html.matchAll(/class="eta[^"]*">(\d{1,2}:\d{2})<\/div>/g)].map(m => ({ pos: m.index, time: m[1] }))
  const participants = [...html.matchAll(/class="participant[^"]*">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, name: m[1].trim() }))
  const categories   = [...html.matchAll(/class="category-row">\s*([^\n<]+)/g)].map(m => ({ pos: m.index, cat: m[1].trim() }))

  const fighterOccurrences = participants.filter(p => p.name.toLowerCase().includes(nameLower))
  if (!fighterOccurrences.length) return null

  // If fighter appears in multiple categories (GI + NoGi), pick by discipline
  let best = fighterOccurrences[0]
  if (fighterOccurrences.length > 1 && discipline) {
    const isNoGi = discipline === 'nogi'
    const isGi   = discipline === 'gi'
    for (const occ of fighterOccurrences) {
      const nearCat = categories.filter(c => c.pos < occ.pos).pop()
      if (!nearCat) continue
      const c = nearCat.cat.toLowerCase()
      if (isNoGi && /no.?gi/i.test(c))                        { best = occ; break }
      if (isGi   && /\bgi\b/.test(c) && !/no.?gi/i.test(c))  { best = occ; break }
    }
  }

  const nearNum     = numbers.filter(n => n.pos < best.pos).pop()
  const nearEta     = etas.filter(e => e.pos < best.pos).pop()
  const opponent    = participants
    .filter(p => p.pos > (nearNum?.pos || 0) && p.pos !== best.pos)
    .find(p => !p.name.toLowerCase().includes(nameLower))

  // Extract category from nearest category-row
  const nearCat = categories.filter(c => c.pos < best.pos).pop()

  return {
    time:     nearEta?.time || null,
    mat:      nearNum ? nearNum.ref.split('-')[0] : null,
    fight:    nearNum ? nearNum.ref.split('-')[1] : null,
    opponent: opponent?.name || null,
    category: nearCat?.cat?.replace(/\s*\(Day \d+\)/i, '').trim() || null,
  }
}

function deriveMatchlistUrl(fighter) {
  // If already a matchlist URL, use directly
  if (fighter.matchlistUrl) return fighter.matchlistUrl
  const url = fighter.bracketUrl || ''
  // If bracketUrl IS a matchlist URL, use it directly
  if (url.includes('/schedule/matchlist')) return url
  // Auto-derive from bracket URL (AJP/Smoothcomp format)
  const m = url.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  if (m) {
    const firstName = encodeURIComponent(fighter.name.split(' ')[0].toLowerCase())
    return `${m[1]}/schedule/matchlist?search=${firstName}&club=&catid=0&mat=&country=`
  }
  return url // fallback
}

export async function scrapeAllFighters(fighters) {
  // All matchlist fetches in parallel — direct browser fetch, no rate limiting
  const results = await Promise.all(fighters.map(async (fighter) => {
    try {
      const matchlistUrl = deriveMatchlistUrl(fighter)
      if (!matchlistUrl) throw new Error('No matchlist URL configured')

      const text = await fetchPageText(matchlistUrl)
      const data = parseMatchlistHtml(text, fighter.name, fighter.discipline)

      if (data && (data.time || data.mat)) {
        return { id: fighter.id, data: { ...data, athlete: fighter.name, status: 'upcoming', fights: [] }, error: null }
      }
      return { id: fighter.id, data: { athlete: fighter.name, status: 'notfound', fights: [] }, error: null }
    } catch (err) {
      return { id: fighter.id, data: null, error: err.message || 'Error fetching data' }
    }
  }))
  return results
}
