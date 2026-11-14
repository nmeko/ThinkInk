// All reading and writing of user data goes through this module.
// Today it saves to the browser (IndexedDB via Dexie); a cloud backend can replace
// these functions later without changing the UI.
import Dexie, { type Table } from "dexie"
import type { JSONContent } from "@tiptap/react"
import { noteText, wikiLinks } from "./text"

export type Stroke = { color: string; size: number; tool: "pen" | "highlighter"; points: [number, number, number][] }
export type TranscriptLine = { start: number; end: number; text: string }

export type Note = {
  id: string
  notebookId: string | null
  title: string
  content: JSONContent
  text: string // plain text, for search and AI
  links: string[] // titles referenced with [[...]]
  tags: string[]
  color: string | null
  pinned: boolean
  ink: Stroke[] // drawing layer
  audioId: string | null
  audioDuration: number
  transcript: TranscriptLine[]
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type Notebook = { id: string; name: string; color: string; createdAt: number }

export type Card = {
  id: string
  noteId: string
  front: string
  back: string
  due: number
  interval: number // days
  ease: number
  reps: number
  createdAt: number
}

type StoredBlob = { id: string; data: Blob }
type Embedding = { noteId: string; vector: number[]; textHash: string }

class ThinkInkDB extends Dexie {
  notes!: Table<Note, string>
  notebooks!: Table<Notebook, string>
  cards!: Table<Card, string>
  blobs!: Table<StoredBlob, string>
  embeddings!: Table<Embedding, string>
  constructor() {
    super("thinkink")
    this.version(1).stores({
      notes: "id, notebookId, updatedAt, deletedAt, pinned, *tags",
      notebooks: "id, createdAt",
      cards: "id, noteId, due",
      blobs: "id",
      embeddings: "noteId",
    })
  }
}

export const db = new ThinkInkDB()
export const newId = () => crypto.randomUUID()

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }

export async function createNote(fields: Partial<Note> = {}): Promise<Note> {
  const now = Date.now()
  const content = fields.content ?? EMPTY_DOC
  const note: Note = {
    id: newId(),
    notebookId: null,
    title: "",
    tags: [],
    color: null,
    pinned: false,
    ink: [],
    audioId: null,
    audioDuration: 0,
    transcript: [],
    createdAt: now,
    deletedAt: null,
    ...fields,
    content,
    text: noteText(content),
    links: wikiLinks(noteText(content)),
    updatedAt: now,
  }
  await db.notes.add(note)
  return note
}

export async function updateNote(id: string, changes: Partial<Note>) {
  const patch: Partial<Note> = { ...changes, updatedAt: Date.now() }
  if (changes.content) {
    patch.text = noteText(changes.content)
    patch.links = wikiLinks(patch.text)
  }
  await db.notes.update(id, patch)
}

export const trashNote = (id: string) => db.notes.update(id, { deletedAt: Date.now(), pinned: false })
export const restoreNote = (id: string) => db.notes.update(id, { deletedAt: null })

export async function deleteNoteForever(id: string) {
  const note = await db.notes.get(id)
  await db.transaction("rw", [db.notes, db.cards, db.blobs, db.embeddings], async () => {
    if (note?.audioId) await db.blobs.delete(note.audioId)
    await db.cards.where("noteId").equals(id).delete()
    await db.embeddings.delete(id)
    await db.notes.delete(id)
  })
}

export async function emptyTrash() {
  const trashed = await db.notes.filter((n) => n.deletedAt !== null).toArray()
  for (const n of trashed) await deleteNoteForever(n.id)
}

export async function createNotebook(name: string, color: string) {
  const nb: Notebook = { id: newId(), name: name.trim() || "Untitled notebook", color, createdAt: Date.now() }
  await db.notebooks.add(nb)
  return nb
}

export async function deleteNotebook(id: string) {
  // Notes are kept: they move to "All notes" instead of being deleted with the notebook.
  await db.transaction("rw", [db.notebooks, db.notes], async () => {
    await db.notes.where("notebookId").equals(id).modify({ notebookId: null })
    await db.notebooks.delete(id)
  })
}

export async function saveBlob(data: Blob) {
  const id = newId()
  await db.blobs.add({ id, data })
  return id
}
export const getBlob = async (id: string) => (await db.blobs.get(id))?.data

// --- Backup: everything as one JSON file (audio included as data URLs) ---
export async function exportAll() {
  const blobs = await Promise.all(
    (await db.blobs.toArray()).map(async (b) => ({ id: b.id, type: b.data.type, data: await blobToDataUrl(b.data) })),
  )
  return {
    app: "ThinkInk",
    version: 1,
    exportedAt: new Date().toISOString(),
    notebooks: await db.notebooks.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    blobs,
  }
}

export async function importAll(data: unknown) {
  const d = data as Awaited<ReturnType<typeof exportAll>>
  if (!d || d.app !== "ThinkInk" || !Array.isArray(d.notes)) throw new Error("This file isn't a ThinkInk backup.")
  await db.transaction("rw", [db.notes, db.notebooks, db.cards, db.blobs], async () => {
    await db.notebooks.bulkPut(d.notebooks ?? [])
    await db.notes.bulkPut(d.notes)
    await db.cards.bulkPut(d.cards ?? [])
    for (const b of d.blobs ?? []) await db.blobs.put({ id: b.id, data: await (await fetch(b.data)).blob() })
  })
  return d.notes.length
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}
