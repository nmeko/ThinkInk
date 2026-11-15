import { exportAll } from "./db"
import { toast } from "./toast"

const LAST = "thinkink-last-backup"

/** Downloads every note, drawing, recording and flashcard as one file. */
export async function downloadBackup() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" })
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `thinkink-backup-${new Date().toISOString().slice(0, 10)}.json` })
  a.click()
  URL.revokeObjectURL(a.href)
  try { localStorage.setItem(LAST, String(Date.now())) } catch { /* storage blocked */ }
  toast(`Backed up ${data.notes.length} notes.`)
}

export type StorageCheck = { kind: "ok" | "unprotected" | "private"; quotaMb: number }

/**
 * Asks the browser to keep ThinkInk's data, and guesses whether this is a private window:
 * private windows get a small storage quota and erase everything when closed.
 */
export async function checkStorage(): Promise<StorageCheck> {
  const s = navigator.storage
  if (!s?.estimate) return { kind: "unprotected", quotaMb: 0 }
  const { quota = 0 } = await s.estimate()
  const quotaMb = Math.round(quota / 1e6)
  if (quotaMb > 0 && quotaMb < 400) return { kind: "private", quotaMb }
  const kept = (await s.persisted?.()) || (await s.persist?.().catch(() => false))
  return { kind: kept ? "ok" : "unprotected", quotaMb }
}
