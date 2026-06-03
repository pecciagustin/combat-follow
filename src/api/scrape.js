const JINA_BASE = 'https://r.jina.ai/'

async function fetchPageText(url) {
  const res = await fetch(JINA_BASE + url, {
    headers: { Accept: 'text/plain' },
  })
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status}`)
  return res.text()
}

// Smoothcomp bracket pages list fighters consecutively in a match block.
// Match references look like "5-64" (tatami 5, fight 64).
// Category is in the page heading: "Male No-Gi / White / Adult / -85 kg"
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

  // Find the fighter's position in the line array
  const fighterIdx = lines.findIndex((l) => l.toLowerCase().includes(nameLower))
  if (fighterIdx === -1) return { status: 'notfound' }

  // --- Tatami ---
  // Search backwards from the fighter for the nearest "N-NN" match reference
  let mat = null
  for (let i = fighterIdx; i >= 0; i--) {
    const m = lines[i].match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) { mat = m[1]; break }
  }

  // --- Opponent ---
  // Grab a window of ±6 lines around the fighter, find other capitalized names
  const windowLines = lines.slice(Math.max(0, fighterIdx - 6), fighterIdx + 6)
  const opponent = findOpponent(windowLines, fighterName)

  // --- Status ---
  // Look for result indicators (result scores, "winner" text, etc.)
  const fullWindow = lines.slice(Math.max(0, fighterIdx - 10), fighterIdx + 10).join(' ')
  let status = 'upcoming'
  if (/\b(result|won|winner|finalizado|finished|ended)\b/i.test(fullWindow)) status = 'finished'
  if (/\b(live|en\s*vivo|in\s*progress|ao\s*vivo|fighting)\b/i.test(fullWindow)) status = 'live'

  // --- Time ---
  // Bracket pages don't have scheduled times; only the schedule page does.
  // Look for a real clock time (not match duration like "5:00")
  const timeMatch = fullWindow.match(/\b([6-9]:\d{2}|[01]\d:\d{2}|2[0-3]:\d{2})\b/)
  const time = timeMatch ? timeMatch[1] : null

  return {
    athlete: fighterName,
    opponent: opponent || 'TBD',
    category,
    time,
    mat,
    status,
  }
}

// Names on Smoothcomp are Title Case, typically 2+ words, not team/club names
// We filter out lines that look like club names, abbreviations, or known non-names
function findOpponent(windowLines, fighterName) {
  const nameLower = fighterName.toLowerCase()

  // Lines to skip: short abbreviations, "BYE", image lines, the fighter themselves
  const skip = new Set(['bye', 'tbd', ''])

  for (const line of windowLines) {
    const l = line.trim()
    if (!l) continue
    if (l.toLowerCase() === nameLower) continue                    // the fighter
    if (l.toLowerCase().includes(nameLower)) continue              // partial match
    if (skip.has(l.toLowerCase())) continue                        // BYE / TBD
    if (/^\d/.test(l)) continue                                    // match ref or number
    if (/^!\[/.test(l)) continue                                   // image markdown
    if (/^https?:/.test(l)) continue                               // URL
    if (/^[A-Z]{1,4}$/.test(l)) continue                          // abbreviation like "MA", "XC"
    if (/\b(jiu.?jitsu|bjj|mma|fight|club|team|academy|escola|equipo|kalmma|checkmat|sfteam|lotus|crazy|lucha)\b/i.test(l)) continue // club names
    // Must look like a name: at least two words, Title Case
    const words = l.split(/\s+/)
    if (words.length >= 2 && words.every((w) => /^[A-ZÁÉÍÓÚÜÑ]/.test(w))) {
      return l
    }
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
