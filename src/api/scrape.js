const JINA_BASE = 'https://r.jina.ai/'

async function fetchPageText(url) {
  const res = await fetch(JINA_BASE + url, {
    headers: { Accept: 'text/plain' },
  })
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status}`)
  return res.text()
}

function parseMatchData(text, fighterName) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const nameLower = fighterName.toLowerCase()

  // Category: first line that looks like a division heading
  const categoryLine = lines.find((l) =>
    /\b(no.?gi|gi)\b/i.test(l) ||
    /\b(white|blue|purple|brown|black)\b/i.test(l) ||
    /\b(adult|master|juvenile)\b/i.test(l)
  )
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

    // Find opponent in nearby lines
    const windowLines = lines.slice(Math.max(0, idx - 6), idx + 6)
    const opponent = findOpponent(windowLines, fighterName)

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

async function scrapeOneFighter(fighter) {
  const text = await fetchPageText(fighter.bracketUrl)
  return parseMatchData(text, fighter.name)
}

export async function scrapeAllFighters(fighters) {
  const results = await Promise.all(
    fighters.map(async (fighter) => {
      try {
        const data = await scrapeOneFighter(fighter)
        return { id: fighter.id, data, error: null }
      } catch (err) {
        return { id: fighter.id, data: null, error: err.message || 'Error fetching data' }
      }
    })
  )
  return results
}
