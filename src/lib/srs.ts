// Spaced repetition (simplified SM-2): cards you know come back later and later;
// cards you miss come back soon.
export type Grade = "again" | "hard" | "good" | "easy"
export type Schedule = { due: number; interval: number; ease: number; reps: number }

const DAY = 24 * 60 * 60 * 1000

export function review(card: Schedule, grade: Grade, now = Date.now()): Schedule {
  let { interval, ease, reps } = card
  if (grade === "again") {
    return { due: now + 10 * 60 * 1000, interval: 0, ease: Math.max(1.3, ease - 0.2), reps: 0 } // again in 10 minutes
  }
  reps += 1
  if (reps === 1) interval = grade === "easy" ? 4 : 1
  else if (reps === 2) interval = grade === "easy" ? 6 : grade === "hard" ? 2 : 3
  else interval = Math.round(interval * (grade === "hard" ? 1.2 : grade === "easy" ? ease * 1.3 : ease))
  ease = Math.max(1.3, ease + (grade === "hard" ? -0.15 : grade === "easy" ? 0.15 : 0))
  return { due: now + interval * DAY, interval, ease, reps }
}

export const newSchedule = (now = Date.now()): Schedule => ({ due: now, interval: 0, ease: 2.5, reps: 0 })

/** Human label for when a grade would bring the card back, e.g. "3d". */
export function previewLabel(card: Schedule, grade: Grade, now = Date.now()) {
  const ms = review(card, grade, now).due - now
  if (ms < DAY) return `${Math.max(1, Math.round(ms / 60000))}m`
  const days = Math.round(ms / DAY)
  return days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`
}
