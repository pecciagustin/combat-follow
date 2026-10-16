// Helpers that keep /api/cron cheap: skip events/fighters whose next fight is
// far away ("dormant") or that recently failed.

export const DORMANT_KEY = 'cf:dormant'
export const ALERT_TTL_SEC = 6 * 3600

const MIN = 60000
const NEAR_MS = 45 * MIN // closer than this → keep polling every run
const WAKE_BEFORE_MS = 40 * MIN // wake this long before the next fight
const MAX_SLEEP_MS = 30 * MIN // never sleep longer than this on a schedule
const DONE_SLEEP_MS = 6 * 3600000 // event fully finished

export function parseJson(raw) {
  if (!raw) return null
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// timings: [{ startMs, isFinished, isRunning }] for every match of the source.
// Returns a "sleep until" timestamp, or null if it must keep being polled.
export function computeDormantUntil(timings, now) {
  if (!timings.length) return null
  if (timings.some((t) => t.isRunning)) return null
  const pending = timings.filter((t) => !t.isFinished)
  if (!pending.length) return now + DONE_SLEEP_MS
  const starts = pending.map((t) => t.startMs).filter((s) => s != null)
  if (!starts.length) return null // nothing scheduled yet: can't tell, stay awake
  const next = Math.min(...starts)
  if (next - now <= NEAR_MS) return null
  return Math.min(next - WAKE_BEFORE_MS, now + MAX_SLEEP_MS)
}

// Load the dormant map, dropping expired entries.
export async function loadDormant(redis, now) {
  const all = (await redis.hgetall(DORMANT_KEY)) || {}
  const active = {}
  const expired = []
  for (const [k, v] of Object.entries(all)) {
    if (Number(v) > now) active[k] = Number(v)
    else expired.push(k)
  }
  if (expired.length) await redis.hdel(DORMANT_KEY, ...expired)
  return active
}
