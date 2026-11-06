// A "division" is the exact bracket name Smoothcomp gives a match (`group`),
// e.g. "Unity League Blue/White belts +80 Kg - Male NoGi / Blue- White / Adult / +80 Kg".
// It stays the same across every round of that bracket, so it is what tells
// apart two brackets of the same athlete when Gi/No-Gi is not enough (events
// with parallel leagues: Unity League NoGi vs. the regular No-Gi bracket).
// Shared by the browser scraper (src/) and the Watch endpoint (api/).

// Lowercase, collapse whitespace and drop Smoothcomp's "(Day N)" suffix so the
// same bracket compares equal however it was rendered.
export function normDivision(s) {
  return String(s || '')
    .replace(/\s*\(Day \d+\)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

// True when a match's group belongs to the given division.
export function matchesDivision(group, division) {
  const d = normDivision(division)
  if (!d) return true
  return normDivision(group) === d
}

// Legacy Gi/No-Gi filter, used when a fighter has no division.
export function matchesDiscipline(group, discipline) {
  const g = String(group || '')
  if (discipline === 'nogi') return /no.?gi/i.test(g)
  if (discipline === 'gi') return /\bgi\b/i.test(g) && !/no.?gi/i.test(g)
  return true
}

// Division wins over discipline: it is the more precise filter.
export function matchesFighterFilter(group, { division, discipline } = {}) {
  if (division) return matchesDivision(group, division)
  return matchesDiscipline(group, discipline)
}

// Display form: original casing, whitespace collapsed, "(Day N)" removed.
export function divisionLabel(s) {
  return String(s || '').replace(/\s*\(Day \d+\)/i, '').replace(/\s+/g, ' ').trim()
}
