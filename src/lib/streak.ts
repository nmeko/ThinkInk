// Daily study streak, kept on this device only.
const KEY = "thinkink-streak"
type Streak = { last: string; days: number }

const day = (d: Date) => d.toLocaleDateString("en-CA") // YYYY-MM-DD in local time
const read = (): Streak | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? "null") } catch { return null } }

/** Days in a row with at least one finished session; 0 once a whole day is missed. */
export function currentStreak(now = new Date()): number {
  const s = read()
  if (!s) return 0
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  return s.last === day(now) || s.last === day(yesterday) ? s.days : 0
}

/** Call when a review or quiz is finished. Returns the new streak. */
export function recordStudy(now = new Date()): number {
  const today = day(now)
  const s = read()
  const days = s?.last === today ? s.days : currentStreak(now) + 1
  try { localStorage.setItem(KEY, JSON.stringify({ last: today, days })) } catch { /* storage blocked: streak just won't persist */ }
  return days
}
