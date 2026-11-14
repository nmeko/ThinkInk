// Share a note without accounts or servers: the note itself is compressed into the link.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string"
import type { JSONContent } from "@tiptap/react"
import type { Stroke } from "./db"

export type SharedNote = { v: 1; title: string; content: JSONContent; tags: string[]; ink: Stroke[] }

export const MAX_LINK_LENGTH = 60_000 // browsers handle long links, but chat apps often cut them

export function encodeShare(note: Omit<SharedNote, "v">): string {
  return compressToEncodedURIComponent(JSON.stringify({ v: 1, ...note }))
}

export function decodeShare(payload: string): SharedNote | null {
  try {
    const raw = decompressFromEncodedURIComponent(payload)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data?.v !== 1 || typeof data.title !== "string" || data.content?.type !== "doc") return null
    return {
      v: 1,
      title: data.title.slice(0, 300),
      content: data.content,
      tags: Array.isArray(data.tags) ? data.tags.filter((t: unknown) => typeof t === "string").slice(0, 20) : [],
      ink: Array.isArray(data.ink) ? data.ink.filter(isStroke).slice(0, 2000) : [],
    }
  } catch {
    return null
  }
}

// Strokes from a link go into the database and onto a canvas, so only well-formed ones are kept.
const isStroke = (s: unknown): s is Stroke => {
  const x = s as Stroke
  return !!x && typeof x.color === "string" && /^#[0-9a-f]{3,8}$/i.test(x.color) && typeof x.size === "number" && x.size > 0 && x.size <= 60 &&
    (x.tool === "pen" || x.tool === "highlighter") && Array.isArray(x.points) &&
    x.points.every((p) => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === "number" && Number.isFinite(n)))
}

export const shareUrl = (payload: string) => `${location.origin}${location.pathname}#share=${payload}`
