import { describe, expect, it } from "vitest"
import { noteText, wikiLinks, toMarkdown, keywordScore, snippet } from "./text"
import { review, newSchedule } from "./srs"
import { extractCards } from "./flashcards"
import { encodeShare, decodeShare } from "./share"

const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Cell biology" }] },
    { type: "paragraph", content: [{ type: "text", text: "Mitochondria: the powerhouse of the cell" }] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Read ch. 3" }] }] }] },
    { type: "paragraph", content: [{ type: "text", text: "See " }, { type: "text", text: "[[Photosynthesis]]" }, { type: "text", text: " and [[ATP]]." }] },
  ],
}

describe("text", () => {
  it("extracts one line per block", () => {
    expect(noteText(doc).split("\n")).toEqual(["Cell biology", "Mitochondria: the powerhouse of the cell", "Read ch. 3", "See [[Photosynthesis]] and [[ATP]]."])
  })
  it("finds [[links]] once each", () => {
    expect(wikiLinks("a [[X]] b [[Y]] [[X]] [[]] [[bad\nlink]]")).toEqual(["X", "Y"])
  })
  it("exports markdown with headings and checked tasks", () => {
    const md = toMarkdown("Bio", doc)
    expect(md).toContain("# Bio")
    expect(md).toContain("## Cell biology")
    expect(md).toContain("- [x] Read ch. 3")
  })
  it("requires every search word to match, ranking titles highest", () => {
    const n = { title: "Cell biology", text: "mitochondria energy", tags: ["bio"] }
    expect(keywordScore("cell energy", n)).toBeGreaterThan(keywordScore("energy", n))
    expect(keywordScore("cell plants", n)).toBe(0)
    expect(snippet("a long text about mitochondria and more", "mito")).toContain("mitochondria")
  })
})

describe("spaced repetition", () => {
  const now = 1_000_000
  it("brings a missed card back in minutes and grows intervals for known ones", () => {
    const first = review(newSchedule(now), "good", now)
    expect(first.interval).toBe(1)
    const second = review(first, "good", now)
    const third = review(second, "good", now)
    expect(third.interval).toBeGreaterThan(second.interval)
    const missed = review(third, "again", now)
    expect(missed.due - now).toBe(10 * 60 * 1000)
    expect(missed.reps).toBe(0)
    expect(missed.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe("flashcards", () => {
  it("builds cards from definitions, Q/A pairs and headings", () => {
    const cards = extractCards(
      "Mitochondria: the powerhouse of the cell\nQ: What is ATP?\nA: The cell's energy currency\nOsmosis - movement of water across a membrane",
      [{ heading: "Photosynthesis", body: "Plants turn light into chemical energy." }],
    )
    const fronts = cards.map((c) => c.front)
    expect(fronts).toContain("What is Mitochondria?")
    expect(fronts).toContain("What is ATP?")
    expect(fronts).toContain("What is Osmosis?")
    expect(fronts).toContain("Explain: Photosynthesis")
  })
  it("falls back to fill-in-the-blank cards for plain prose", () => {
    const cards = extractCards("The French Revolution began in 1789 when citizens stormed the Bastille in Paris.")
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].front).toContain("_____")
  })
})

describe("share links", () => {
  it("round-trips a note through a link", () => {
    const note = { title: "Bio", content: doc, tags: ["bio"], ink: [] }
    expect(decodeShare(encodeShare(note))).toEqual({ v: 1, ...note })
  })
  it("rejects garbage and hostile payloads", () => {
    expect(decodeShare("not-a-real-payload")).toBeNull()
    expect(decodeShare(encodeShare({ title: "x", content: { type: "script" } as never, tags: [], ink: [] }))).toBeNull()
  })
  it("drops malformed ink strokes from a link", () => {
    const good = { color: "#ff0000", size: 3, tool: "pen" as const, points: [[1, 2, 0.5]] as [number, number, number][] }
    const bad = [{ color: "red;}", size: 3, tool: "pen", points: [] }, { ...good, points: "x" }, { ...good, size: 1e9 }, null]
    const out = decodeShare(encodeShare({ title: "x", content: { type: "doc", content: [] }, tags: [], ink: [good, ...bad] as never }))
    expect(out?.ink).toEqual([good])
  })
})
