import { useState } from "react"
import { db, newId } from "../lib/db"
import { newSchedule } from "../lib/srs"
import { extractCards, type DraftCard } from "../lib/flashcards"
import * as gemini from "../lib/ai/gemini"
import { toast } from "../lib/toast"
import { Modal } from "./Modal"
import { Icon } from "./Icon"

type Row = DraftCard & { keep: boolean }

const EXAMPLES = ["10 cards on the key dates and why they matter", "Fill-in-the-blank cards for every formula", "Define each bold term in simple words", "Cards that compare the two theories"]

/**
 * Flashcards are never saved without the student seeing them: draft from the note, ask for exactly
 * what you want, or type your own, then fix any question or answer before adding them.
 */
export function CardBuilder({ noteId, text, headings, onClose }: { noteId: string; text: string; headings: { heading: string; body: string }[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [request, setRequest] = useState("")
  const [busy, setBusy] = useState(false)
  const ai = gemini.hasKey()

  const add = (cards: DraftCard[]) => {
    if (!cards.length) return toast("No flashcard material found. Try 'Term: definition' lines or Q:/A: pairs.")
    setRows((r) => [...r, ...cards.map((c) => ({ ...c, keep: true }))])
  }
  const run = async (fn: () => Promise<DraftCard[]>) => {
    setBusy(true)
    try { add(await fn()) } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  const fromNote = () => run(async () => (ai ? gemini.makeCards(text) : extractCards(text, headings)))
  // Without AI, a pasted list of "term: definition" or Q:/A: lines still becomes cards.
  const fromRequest = () => run(async () => (ai ? gemini.makeCards(text, request) : extractCards(request, [])))
  const edit = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  const save = async () => {
    const keep = rows.filter((r) => r.keep && r.front.trim() && r.back.trim())
    if (!keep.length) return toast("Pick at least one card with a question and an answer.")
    const now = Date.now()
    await db.cards.bulkAdd(keep.map((c) => ({ id: newId(), noteId, front: c.front.trim(), back: c.back.trim(), ...newSchedule(now), createdAt: now })))
    toast(`${keep.length} flashcard${keep.length === 1 ? "" : "s"} added. Review them in Study.`)
    onClose()
  }

  const kept = rows.filter((r) => r.keep).length

  return (
    <Modal title="Make flashcards" onClose={onClose} wide>
      <div className="row">
        <button className="btn" onClick={fromNote} disabled={busy}><Icon name="sparkles" /> Draft from this note</button>
        <button className="btn btn-ghost" onClick={() => setRows((r) => [...r, { front: "", back: "", keep: true }])}><Icon name="plus" /> Write my own</button>
      </div>

      <label className="field">
        <span>{ai ? "Or ask for exactly the cards you want" : "Or paste a list (one per line: \"term: definition\" or Q: / A:)"}</span>
        <textarea
          className="input"
          rows={3}
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder={ai ? "e.g. 12 cards on the steps of mitosis, in order" : "Mitosis: cell division that makes two identical cells"}
        />
      </label>
      {ai && (
        <div className="chips">
          {EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setRequest(x)}>{x}</button>)}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={fromRequest} disabled={busy || !request.trim()}>
          <Icon name="sparkles" /> {ai ? "Make these cards" : "Turn list into cards"}
        </button>
        {busy && <span role="status" style={{ color: "var(--muted)" }}>Making cards…</span>}
      </div>
      {!ai && <p className="notice" style={{ margin: 0 }}>Add a free Gemini key in Settings to ask for specific cards in your own words.</p>}

      {rows.length > 0 && (
        <>
          <h3 style={{ margin: "8px 0 0" }}>Check and edit ({kept} of {rows.length} selected)</h3>
          <ol className="card-drafts">
            {rows.map((r, i) => (
              <li key={i} className={r.keep ? "" : "off"}>
                <label className="keep">
                  <input type="checkbox" checked={r.keep} onChange={(e) => edit(i, { keep: e.target.checked })} />
                  <span className="sr-only">Keep card {i + 1}</span>
                </label>
                <div className="qa">
                  <label><span className="sr-only">Question {i + 1}</span>
                    <textarea className="input" rows={2} value={r.front} placeholder="Question" onChange={(e) => edit(i, { front: e.target.value })} />
                  </label>
                  <label><span className="sr-only">Answer {i + 1}</span>
                    <textarea className="input" rows={2} value={r.back} placeholder="Answer" onChange={(e) => edit(i, { back: e.target.value })} />
                  </label>
                </div>
                <button className="icon-btn" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Delete card ${i + 1}`}><Icon name="trash" /></button>
              </li>
            ))}
          </ol>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!kept}><Icon name="check" /> Add {kept} card{kept === 1 ? "" : "s"}</button>
          </div>
        </>
      )}
    </Modal>
  )
}
