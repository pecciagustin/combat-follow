// Use our Vercel proxy so the Jina API key stays server-side
// and requests are not rate-limited per browser IP
const PROXY_BASE = '/api/fetch?url='

async function fetchPageText(url, retries = 3) {
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

function parseMatchData(text, fighterName) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()

  // Category: first line that looks like a division heading
  // Skip navigation/menu lines (start with *, [, contain http, or are too long)
  const categoryLine = lines.find((l) => {
    if (l.startsWith('*') || l.startsWith('[') || l.startsWith('!') || l.includes('http')) return false
    if (l.length > 100) return false
    return (
      /\b(no.?gi|gi)\b/i.test(l) ||
      /\b(white|blue|purple|brown|black)\b/i.test(l) ||
      /\b(adult|master|juvenile)\b/i.test(l)
    )
  })
  const category = categoryLine ? categoryLine.replace(/^#+\s*/, '').replace(/\*+/g, '').trim() : null

  // Find ALL occurrences of the fighter name in the text
  const allIdxs = lines.reduce((acc, l, i) => {
    if (l.toLowerCase().includes(nameLower)) acc.push(i)
    return acc
  }, [])

  if (allIdxs.length === 0) return { status: 'notfound' }

  // Build list of all fights
  const fights = []
  const seenRefs = new Set()

  for (const idx of allIdxs) {
    // Skip image lines and results table lines
    if (/^!\[/.test(lines[idx]) || /^\|/.test(lines[idx])) continue

    // Find the match reference (N-NN) searching backwards
    let matchRef = null, mat = null, fight = null, roundName = null
    for (let i = idx; i >= Math.max(0, idx - 10); i--) {
      const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/)
      if (m) { matchRef = lines[i]; mat = m[1]; fight = m[2]; break }
    }
    if (!matchRef || seenRefs.has(matchRef)) continue
    seenRefs.add(matchRef)

    // Find round name (### Final, ### Bronze match, etc.) above the match ref
    for (let i = lines.indexOf(matchRef) - 1; i >= Math.max(0, lines.indexOf(matchRef) - 5); i--) {
      if (/^###/.test(lines[i])) { roundName = lines[i].replace(/^#+\s*/, '').trim(); break }
    }

    // Find opponent within this match block: from matchRef line to next matchRef line
    const matchRefLineIdx = lines.indexOf(matchRef, Math.max(0, idx - 15))
    const nextRefIdx = lines.findIndex((l, i) => i > matchRefLineIdx + 1 && /^(\d+)\s*-\s*(\d+)$/.test(l))
    const blockEnd = nextRefIdx === -1 ? Math.min(lines.length, matchRefLineIdx + 20) : nextRefIdx
    const blockLines = lines.slice(matchRefLineIdx, blockEnd)
    const opponent = findOpponent(blockLines, fighterName)

    // Find result number next to fighter (1 = gold, 2 = silver, 3 = bronze)
    let result = null
    const afterFighter = lines.slice(idx, Math.min(lines.length, idx + 3))
    const numMatch = afterFighter.find((l) => /^[123]$/.test(l))
    if (numMatch) result = parseInt(numMatch)

    // Time: real clock time near this match
    const nearLines = lines.slice(Math.max(0, idx - 10), idx + 10).join(' ')
    const timeMatch = nearLines.match(/\b([6-9]:\d{2}|[01]\d:\d{2}|2[0-3]:\d{2})\b/)
    const time = timeMatch ? timeMatch[1] : null

    fights.push({ mat, fight, matchRef, roundName, opponent: opponent || 'TBD', time, result })
  }

  if (fights.length === 0) return { status: 'notfound' }

  // Sort by fight number ascending (early rounds first)
  fights.sort((a, b) => parseInt(a.fight) - parseInt(b.fight))

  // Check results table for placement
  let placement = null
  const resultsIdx = lines.findIndex((l) => /^##\s*results/i.test(l))
  if (resultsIdx !== -1) {
    const resultsBlock = lines.slice(resultsIdx, resultsIdx + 10).join('\n')
    const placementMatch = resultsBlock.match(new RegExp(`\\|\\s*(\\d+)\\s*\\|[^|]*${escapeRegex(fighterName)}`, 'i'))
    if (placementMatch) placement = parseInt(placementMatch[1])
  }

  // The "current" fight: last one (most advanced round)
  const lastFight = fights[fights.length - 1]

  // Status: if placement found → finished; if time found → upcoming; else upcoming
  let status = 'upcoming'
  if (placement !== null || fights.some((f) => f.result !== null)) status = 'finished'

  return {
    athlete: fighterName,
    opponent: lastFight.opponent,
    category,
    time: lastFight.time,
    mat: lastFight.mat,
    fight: lastFight.fight,
    round: lastFight.roundName,
    placement,
    status,
    fights, // full tree
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findOpponent(windowLines, fighterName) {
  const nameLower = fighterName.toLowerCase()
  const skip = new Set(['bye', 'tbd', ''])

  for (const line of windowLines) {
    const l = line.trim()
    if (!l) continue
    if (l.toLowerCase() === nameLower) continue
    if (l.toLowerCase().includes(nameLower)) continue
    if (skip.has(l.toLowerCase())) continue
    if (/^\d/.test(l)) continue
    if (/^!\[/.test(l) || /^https?:/.test(l) || /^\|/.test(l)) continue
    if (/^[A-Z]{1,4}$/.test(l)) continue
    if (/\b(jiu.?jitsu|bjj|mma|fight|club|team|academy|escola|equipo|kalmma|checkmat|sfteam|lotus|crazy|lucha|playjitsu|newaza|rom\s|cupula)\b/i.test(l)) continue
    const words = l.split(/\s+/)
    if (words.length >= 2 && words.every((w) => /^[A-ZÁÉÍÓÚÜÑ]/.test(w))) return l
  }
  return null
}

// ── BJJ Comp System parser ────────────────────────────
function parseBjjCompSystem(text, fighterName) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()

  // Category: first non-empty line
  const category = lines[0] || null

  // Split into match blocks using "* * *" separator
  const sepIdxs = [-1, ...lines.reduce((a, l, i) => (l === '* * *' ? [...a, i] : a), []), lines.length]

  // Find all clean blocks (no ranking table, no BYE-only blocks) containing the fighter
  const fighterBlocks = []
  for (let i = 0; i < sepIdxs.length - 1; i++) {
    const blockLines = lines.slice(sepIdxs[i] + 1, sepIdxs[i + 1])
    const blockText = blockLines.join(' ')
    if (!blockText.toLowerCase().includes(nameLower)) continue
    if (/ranking|grand\s*slam|\|\s*---|\|\s*nº/i.test(blockText)) continue  // skip results table
    if (blockLines.length > 15) continue  // skip oversized blocks
    fighterBlocks.push(blockLines)
  }

  if (fighterBlocks.length === 0) return { status: 'notfound' }

  // Last block = most advanced match
  const lastBlock = fighterBlocks[fighterBlocks.length - 1]
  const lastBlockText = lastBlock.join(' ')

  // Opponent from last block
  const opponent = findOpponent(lastBlock, fighterName)

  // Fight/mat/time from last block or nearby lines
  let mat = null, fight = null, time = null
  const fightMatMatch = lastBlockText.match(/fight\s+(\d+)[:\s-]+mat\s+(\d+)/i)
  if (fightMatMatch) { fight = fightMatMatch[1]; mat = fightMatMatch[2] }
  const timeMatch = lastBlockText.match(/\b([6-9]:\d{2}|[01]\d:\d{2}|2[0-3]:\d{2})\b/)
  if (timeMatch) time = timeMatch[1]

  // Placement from ranking table
  let placement = null
  const rankMatch = text.match(new RegExp(`\\|\\s*(\\d+)\\s+${escapeRegex(fighterName)}`, 'i'))
  if (rankMatch) placement = parseInt(rankMatch[1])

  const status = placement !== null ? 'finished' : 'upcoming'

  // All fights with round names
  const roundNames = ['Primera ronda', 'Cuartos', 'Semifinal', 'Final']
  const fights = fighterBlocks.map((bl, i) => {
    const opp = findOpponent(bl, fighterName)
    const blText = bl.join(' ')
    const fm = blText.match(/fight\s+(\d+)[:\s-]+mat\s+(\d+)/i)
    const roundIdx = fighterBlocks.length <= 4
      ? i + (4 - fighterBlocks.length)
      : i
    return {
      opponent: opp || 'TBD',
      matchRef: fm ? `Fight ${fm[1]}` : null,
      mat: fm ? fm[2] : null,
      fight: fm ? fm[1] : null,
      roundName: roundNames[roundIdx] || `Ronda ${i + 1}`,
      result: null,
    }
  })

  return { athlete: fighterName, opponent: opponent || 'TBD', category, time, mat, fight, placement, status, fights, round: fights[fights.length - 1]?.roundName }
}

async function fetchHtml(url) {
  const res = await fetch(PROXY_BASE + encodeURIComponent(url) + '&format=html')
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  return res.text()
}

function parseBjjCompSystemHtml(html, fighterName) {
  const nameLower = fighterName.toLowerCase()

  // Extract all match blocks from HTML
  // Each block has: FIGHT XX, Mat Y, time, competitor names
  const matchBlocks = []

  // Find all fight headers
  const fightPattern = /FIGHT\s+(\d+)[^<]*<\/span>\s*Mat\s+(\d+)/g
  const timePattern = /bracket-match-header__when[^>]*>([^<]+)</g
  const namePattern = /match-card__competitor-name[^>]*>([^<]+)</g

  // Parse by splitting on fight headers
  const fightSections = html.split(/(?=FIGHT\s+\d+)/)

  for (const section of fightSections) {
    const fightMatch = section.match(/FIGHT\s+(\d+)[^>]*>?\s*Mat\s+(\d+)/)
    if (!fightMatch) continue

    const fightNum = fightMatch[1]
    const matNum = fightMatch[2]

    // Extract time
    const timeMatch = section.match(/bracket-match-header__when[^>]*>([^<]+)</)
    let time = null
    if (timeMatch) {
      // "Fri 05/29 at 04:27 PM" → "16:27"
      const t = timeMatch[1].match(/at\s+(\d+):(\d+)\s*(AM|PM)/i)
      if (t) {
        let h = parseInt(t[1])
        const m = t[2]
        const period = t[3].toUpperCase()
        if (period === 'PM' && h !== 12) h += 12
        if (period === 'AM' && h === 12) h = 0
        time = `${String(h).padStart(2, '0')}:${m}`
      }
    }

    // Extract competitor names
    const names = []
    const nameRe = /match-card__competitor-name[^>]*>([^<]+)</g
    let nm
    while ((nm = nameRe.exec(section)) !== null) {
      const n = nm[1].trim()
      if (n && !names.includes(n)) names.push(n)
    }

    // Only include fights where the fighter is one of the first 2 competitors
    // (3+ names = bracket preview artifact showing potential future opponents)
    if (names.length <= 2 && names.some(n => n.toLowerCase().includes(nameLower))) {
      matchBlocks.push({ fightNum, matNum, time, names })
    }
  }

  if (matchBlocks.length === 0) {
    // Fallback to text parser
    return null
  }

  // Sort by fight number (ascending = chronological order in bracket)
  matchBlocks.sort((a, b) => parseInt(a.fightNum) - parseInt(b.fightNum))

  // Last block = most advanced/final match
  const lastBlock = matchBlocks[matchBlocks.length - 1]
  const opponent = lastBlock.names.find(n => !n.toLowerCase().includes(nameLower)) || 'TBD'

  // Category from text portion
  const categoryMatch = html.match(/tournament-category__title[^>]*>([^<]+)</)
  const category = categoryMatch ? categoryMatch[1].trim() : null

  // Placement from podium section: podium__gold/silver/bronze followed by competitor name
  let placement = null
  const podiumMap = { gold: 1, silver: 2, bronze: 3 }
  const podiumMatch = html.match(/podium__(gold|silver|bronze)[^]*?podium__competitor-name[^>]*>([^<]+)</i)
  if (podiumMatch) {
    // Find all podium entries and match against fighter name
    const podiumRe = /podium__(gold|silver|bronze)[^]*?podium__competitor-name[^>]*>([^<]+)</gi
    let pm
    while ((pm = podiumRe.exec(html)) !== null) {
      if (pm[2].trim().toLowerCase().includes(nameLower)) {
        placement = podiumMap[pm[1].toLowerCase()] || null
        break
      }
    }
  }

  const status = placement !== null ? 'finished' : 'upcoming'

  const roundNames = ['Primera ronda', 'Cuartos', 'Semifinal', 'Final']
  const fights = matchBlocks.map((b, i) => {
    const opp = b.names.find(n => !n.toLowerCase().includes(nameLower)) || 'TBD'
    const roundIdx = matchBlocks.length <= 4 ? i + (4 - matchBlocks.length) : i
    return {
      opponent: opp,
      matchRef: `Fight ${b.fightNum}`,
      mat: b.matNum,
      fight: b.fightNum,
      time: b.time,
      roundName: roundNames[roundIdx] || `Ronda ${i + 1}`,
      result: null,
    }
  })

  return {
    athlete: fighterName,
    opponent,
    category,
    time: lastBlock.time,
    mat: lastBlock.matNum,
    fight: lastBlock.fightNum,
    round: fights[fights.length - 1]?.roundName,
    placement,
    status,
    fights,
  }
}

async function scrapeOneFighter(fighter) {
  // Try bracket fetch — if it fails (e.g. Jina quota), return minimal stub
  // Time and mat come from matchlist anyway (always fetched directly, no Jina)
  try {
    if (fighter.bracketUrl.includes('bjjcompsystem.com') && !fighter.bracketUrl.includes('smoothcomp') && !fighter.bracketUrl.includes('ajptour')) {
      const html = await fetchHtml(fighter.bracketUrl)
      const result = parseBjjCompSystemHtml(html, fighter.name)
      if (result) return result
      const text = await fetchPageText(fighter.bracketUrl)
      return parseBjjCompSystem(text, fighter.name)
    }
    const text = await fetchPageText(fighter.bracketUrl)
    return parseMatchData(text, fighter.name)
  } catch {
    // Bracket unavailable — return stub so matchlist time still shows
    return { athlete: fighter.name, opponent: null, category: null, time: null, mat: null, fight: null, status: 'upcoming', fights: [] }
  }
}

function buildMatchlistBaseUrl(bracketUrl) {
  // From: https://ajptour.com/en/event/1450/bracket/129306
  // To:   https://ajptour.com/en/event/1450/schedule/matchlist (no search — gets ALL matches)
  const m = bracketUrl.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  return m ? `${m[1]}/schedule/matchlist?search=&club=&catid=0&mat=&country=` : null
}

function parseMatchlistHtml(html, fighterName, bracketCategory) {
  const nameLower = fighterName.toLowerCase()

  // Extract all match data points by position in the HTML
  const numbers = [...html.matchAll(/<div class="number">([^<]+)<\/div>/g)]
    .map(m => ({ pos: m.index, ref: m[1].trim() }))
  const etas = [...html.matchAll(/class="eta[^"]*">(\d{1,2}:\d{2})<\/div>/g)]
    .map(m => ({ pos: m.index, time: m[1] }))
  const participants = [...html.matchAll(/class="participant[^"]*">\s*([^\n<]+)/g)]
    .map(m => ({ pos: m.index, name: m[1].trim() }))
  const categories = [...html.matchAll(/class="category-row">\s*([^\n<]+)/g)]
    .map(m => ({ pos: m.index, cat: m[1].trim() }))

  // Find all positions where fighter appears
  const fighterOccurrences = participants.filter(p => p.name.toLowerCase().includes(nameLower))
  if (!fighterOccurrences.length) return null

  // If multiple (multi-category), pick by GI/NoGi
  let best = fighterOccurrences[0]
  if (fighterOccurrences.length > 1 && bracketCategory) {
    const catLower = bracketCategory.toLowerCase()
    const isNoGi = /no.?gi/i.test(catLower)
    const isGi = /\bgi\b/.test(catLower) && !isNoGi
    for (const occ of fighterOccurrences) {
      const nearCat = categories.filter(c => c.pos < occ.pos).pop()
      if (!nearCat) continue
      const c = nearCat.cat.toLowerCase()
      if (isNoGi && /no.?gi/i.test(c)) { best = occ; break }
      if (isGi && /\bgi\b/.test(c) && !/no.?gi/i.test(c)) { best = occ; break }
    }
  }

  // Find closest number, eta, and opponent near the fighter position
  const nearNum = numbers.filter(n => n.pos < best.pos).pop()
  const nearEta = etas.filter(e => e.pos < best.pos).pop()
  const opponent = participants
    .filter(p => p.pos > (nearNum?.pos || 0) && p.pos !== best.pos)
    .find(p => !p.name.toLowerCase().includes(nameLower))

  return {
    time: nearEta?.time || null,
    mat: nearNum ? nearNum.ref.split('-')[0] : null,
    fight: nearNum ? nearNum.ref.split('-')[1] : null,
    opponent: opponent?.name || null,
  }
}

function extractTimeFromMatchlistText(text, fighterName, bracketCategory) {
  // Detect if it's raw HTML or Jina markdown text
  if (text.includes('<div') && text.includes('match-row')) {
    return parseMatchlistHtml(text, fighterName, bracketCategory)
  }

  // Fallback: Jina markdown text parsing
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()
  const contentStart = lines.findIndex(l => l.startsWith('Markdown Content'))
  const searchFrom = contentStart >= 0 ? contentStart : 0

  const allIdxs = lines.reduce((acc, l, i) => {
    if (i > searchFrom && l.toLowerCase().includes(nameLower) && !l.startsWith('http') && !l.startsWith('*'))
      acc.push(i)
    return acc
  }, [])
  if (allIdxs.length === 0) return null

  let bestIdx = allIdxs[0]
  if (allIdxs.length > 1 && bracketCategory) {
    const catLower = bracketCategory.toLowerCase()
    const isGi = /\bgi\b/.test(catLower) && !/no.?gi/i.test(catLower)
    const isNoGi = /no.?gi/i.test(catLower)
    for (const idx of allIdxs) {
      const nearby = lines.slice(Math.max(0, idx - 10), idx).join(' ').toLowerCase()
      if (isNoGi && /no.?gi/i.test(nearby)) { bestIdx = idx; break }
      if (isGi && /\bgi\b/.test(nearby) && !/no.?gi/i.test(nearby)) { bestIdx = idx; break }
    }
  }

  const window = lines.slice(Math.max(0, bestIdx - 5), bestIdx + 3).join(' ')
  const allTimes = [...window.matchAll(/\b([6-9]:\d{2}|[01]\d:\d{2}|2[0-3]:\d{2})\b/g)]
  return allTimes.length > 0 ? allTimes[allTimes.length - 1][1] : null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function buildMatchlistSearchUrl(bracketUrl, fighterName, manualUrl) {
  if (manualUrl) return manualUrl
  const m = bracketUrl.match(/(https?:\/\/[^/]+\/(?:[a-z]{2}\/)?event\/\d+)/)
  if (!m) return null
  const firstName = encodeURIComponent(fighterName.split(' ')[0].toLowerCase())
  return `${m[1]}/schedule/matchlist?search=${firstName}&club=&catid=0&mat=&country=`
}

export async function scrapeAllFighters(fighters) {
  const results = []

  // Process each fighter fully sequentially through the proxy
  // Bracket fetch + matchlist fetch per fighter, one at a time
  for (let i = 0; i < fighters.length; i++) {
    const fighter = fighters[i]
    try {
      // 1. Fetch bracket
      const data = await scrapeOneFighter(fighter)

      // 2. Fetch matchlist directly (no Jina, server-side rendered) — always works
      try {
        const matchlistUrl = buildMatchlistSearchUrl(fighter.bracketUrl, fighter.name, fighter.matchlistUrl)
        if (matchlistUrl) {
          const text = await fetchPageText(matchlistUrl)
          const matchlistData = extractTimeFromMatchlistText(text, fighter.name, data.category)
          if (matchlistData && typeof matchlistData === 'object') {
            // Merge matchlist data — override bracket data with fresher matchlist data
            if (matchlistData.time) data.time = matchlistData.time
            if (matchlistData.mat) data.mat = matchlistData.mat
            if (matchlistData.fight) data.fight = matchlistData.fight
            if (matchlistData.opponent && !data.opponent) data.opponent = matchlistData.opponent
            if (data.status === 'upcoming' || !data.status) data.status = 'upcoming'
          } else if (typeof matchlistData === 'string') {
            data.time = matchlistData
          }
        }
      } catch { /* matchlist unavailable, use bracket data only */ }

      results.push({ id: fighter.id, data, error: null })
    } catch (err) {
      results.push({ id: fighter.id, data: null, error: err.message || 'Error fetching data' })
    }

    // Small delay between fighters to avoid proxy overload
    if (i < fighters.length - 1) await sleep(500)
  }

  return results
}
