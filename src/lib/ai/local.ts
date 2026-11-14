// Free, private AI that runs in the browser.
import { db, type Note, type TranscriptLine } from "../db"
import { sentences } from "../text"

type Progress = (pct: number) => void
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: Progress }>()

function call<T>(msg: Record<string, unknown>, onProgress?: Progress, transfer: Transferable[] = []): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e) => {
      const { id, kind } = e.data
      const p = pending.get(id)
      if (!p) return
      if (kind === "progress") p.onProgress?.(e.data.progress)
      else {
        pending.delete(id)
        if (kind === "done") p.resolve(e.data.result)
        else p.reject(new Error(e.data.error))
      }
    }
  }
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress })
    worker!.postMessage({ id, ...msg }, transfer)
  })
}

export const embed = (texts: string[], onProgress?: Progress) => call<number[][]>({ kind: "embed", texts }, onProgress)

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) // vectors are normalized

// Cheap fingerprint so a note is re-embedded only after its text changes.
function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return String(h)
}

const noteDoc = (n: Note) => `${n.title}\n${n.tags.join(" ")}\n${n.text}\n${n.transcript.map((t) => t.text).join(" ")}`.slice(0, 2000)

/** Makes sure every live note has an up-to-date embedding. */
export async function indexNotes(onProgress?: Progress) {
  const notes = await db.notes.filter((n) => n.deletedAt === null).toArray()
  const stored = new Map((await db.embeddings.toArray()).map((e) => [e.noteId, e]))
  const stale = notes.filter((n) => stored.get(n.id)?.textHash !== hash(noteDoc(n)) && noteDoc(n).trim().length > 3)
  for (let i = 0; i < stale.length; i += 16) {
    const batch = stale.slice(i, i + 16)
    const vectors = await embed(batch.map(noteDoc), onProgress)
    await db.embeddings.bulkPut(batch.map((n, j) => ({ noteId: n.id, vector: vectors[j], textHash: hash(noteDoc(n)) })))
  }
}

/** Notes ranked by meaning, not exact words. */
export async function semanticSearch(query: string, limit = 8, onProgress?: Progress) {
  await indexNotes(onProgress)
  const [q] = await embed([query], onProgress)
  const all = await db.embeddings.toArray()
  const live = new Set((await db.notes.filter((n) => n.deletedAt === null).primaryKeys()) as string[])
  return all
    .filter((e) => live.has(e.noteId))
    .map((e) => ({ noteId: e.noteId, score: dot(q, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Notes most similar to this one (for the "Related" panel). */
export async function relatedNotes(noteId: string, limit = 5) {
  await indexNotes()
  const all = await db.embeddings.toArray()
  const me = all.find((e) => e.noteId === noteId)
  if (!me) return []
  const live = new Set((await db.notes.filter((n) => n.deletedAt === null).primaryKeys()) as string[])
  return all
    .filter((e) => e.noteId !== noteId && live.has(e.noteId))
    .map((e) => ({ noteId: e.noteId, score: dot(me.vector, e.vector) }))
    .filter((r) => r.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** The sentences in these notes that best answer a question (offline answer). */
export async function bestPassages(question: string, notes: Note[], limit = 4) {
  const items = notes.flatMap((n) => sentences(n.text).slice(0, 80).map((s) => ({ noteId: n.id, text: s })))
  if (!items.length) return []
  const [q, ...vecs] = await embed([question, ...items.map((i) => i.text)])
  return items.map((it, i) => ({ ...it, score: dot(q, vecs[i]) })).sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Speech to text with timestamps; audio is decoded to 16 kHz mono first. */
export async function transcribe(blob: Blob, onProgress?: Progress): Promise<TranscriptLine[]> {
  const ctx = new AudioContext({ sampleRate: 16000 })
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const audio = decoded.getChannelData(0).slice()
    return await call<TranscriptLine[]>({ kind: "transcribe", audio }, onProgress, [audio.buffer])
  } finally {
    ctx.close()
  }
}

/** Offline summary: the sentences that share the most important words with the rest. */
export function extractiveSummary(text: string, count = 4): string[] {
  const sents = sentences(text)
  if (sents.length <= count) return sents
  const words = (s: string) => s.toLowerCase().match(/\p{L}{4,}/gu) ?? []
  const freq = new Map<string, number>()
  for (const w of words(text)) freq.set(w, (freq.get(w) ?? 0) + 1)
  const scored = sents.map((s, i) => {
    const ws = words(s)
    return { s, i, score: ws.reduce((t, w) => t + (freq.get(w) ?? 0), 0) / Math.sqrt(ws.length + 1) }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, count).sort((a, b) => a.i - b.i).map((x) => x.s)
}
