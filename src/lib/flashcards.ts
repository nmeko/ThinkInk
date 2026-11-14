// Turns notes into study cards without any AI model (works offline, instantly).
// Patterns students already write: "Term: definition", "Term - definition", "Q: ... A: ...",
// headings with the text under them, and key sentences turned into fill-in-the-blank.
import { sentences } from "./text"

export type DraftCard = { front: string; back: string }

const DEF = /^\s*(?:[-*•]\s*)?([^:\n]{2,60}?)(?:\s*[:—–=]\s+|\s+-\s+)(.{3,300})$/

export function extractCards(text: string, headings: { heading: string; body: string }[] = []): DraftCard[] {
  const cards: DraftCard[] = []
  const seen = new Set<string>()
  const add = (front: string, back: string) => {
    const key = front.toLowerCase()
    if (front && back && !seen.has(key)) { seen.add(key); cards.push({ front, back }) }
  }
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean)

  // Q: / A: pairs
  for (let i = 0; i < lines.length - 1; i++) {
    const q = lines[i].match(/^q(?:uestion)?\s*[:.)]\s*(.+)/i)
    const a = lines[i + 1].match(/^a(?:nswer)?\s*[:.)]\s*(.+)/i)
    if (q && a) add(q[1], a[1])
  }
  // Term: definition
  for (const line of lines) {
    if (/^(q|a|question|answer)\s*[:.)]/i.test(line) || /https?:\/\//.test(line)) continue
    const m = line.match(DEF)
    if (m && m[1].split(/\s+/).length <= 7) add(`What is ${m[1].replace(/\*\*/g, "")}?`, m[2])
  }
  // Heading -> its notes
  for (const h of headings) {
    if (h.body.trim().length > 10) add(h.heading.endsWith("?") ? h.heading : `Explain: ${h.heading}`, h.body.trim().slice(0, 400))
  }
  // Fill-in-the-blank from the most "fact-like" sentences when little else was found
  if (cards.length < 5) {
    for (const s of sentences(text)) {
      const word = keyTerm(s)
      if (word && s.length < 220) add(s.replace(new RegExp(`\\b${escape(word)}\\b`), "_____"), word)
      if (cards.length >= 12) break
    }
  }
  return cards
}

// The longest capitalized or numeric term in a sentence is usually the fact worth testing.
function keyTerm(s: string): string | null {
  const words = s.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter(Boolean)
  if (words.length < 5) return null
  const candidates = words.slice(1).filter((w) => /^\p{Lu}/u.test(w) || /^\d{2,}/.test(w))
  const pick = (candidates.length ? candidates : words.filter((w) => w.length > 7)).sort((a, b) => b.length - a.length)[0]
  return pick && pick.length > 3 ? pick : null
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
