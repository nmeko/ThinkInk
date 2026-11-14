import { useEffect, useMemo, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db, newId, type Card, type Note, type Notebook } from "../lib/db"
import { review, previewLabel, newSchedule, type Grade } from "../lib/srs"
import { extractCards } from "../lib/flashcards"
import { displayTitle } from "../lib/text"
import * as gemini from "../lib/ai/gemini"
import { toast } from "../lib/toast"
import { Icon } from "./Icon"

type Mode = { kind: "home" } | { kind: "review"; scope: string } | { kind: "quiz"; scope: string }
type QuizQ = { question: string; choices: string[]; answer: number; why?: string }

export function StudyView({ notes, notebooks, onOpenNote }: { notes: Note[]; notebooks: Notebook[]; onOpenNote: (id: string) => void }) {
  const cards = useLiveQuery(() => db.cards.toArray(), []) ?? []
  const [mode, setMode] = useState<Mode>({ kind: "home" })
  const [busy, setBusy] = useState(false)
  const live = notes.filter((n) => !n.deletedAt)
  const noteOf = useMemo(() => new Map(live.map((n) => [n.id, n])), [live])
  const liveCards = cards.filter((c) => noteOf.has(c.noteId))
  const inScope = (c: Card, scope: string) => scope === "all" || noteOf.get(c.noteId)?.notebookId === scope
  const now = Date.now()
  const due = (scope: string) => liveCards.filter((c) => inScope(c, scope) && c.due <= now)

  const buildDeck = async (scope: string) => {
    const source = live.filter((n) => scope === "all" || n.notebookId === scope)
    if (!source.length) return toast("Add some notes first.")
    setBusy(true)
    try {
      const existing = new Set(liveCards.map((c) => c.front.toLowerCase()))
      let added = 0
      for (const n of source) {
        const drafts = gemini.hasKey() ? await gemini.makeCards(n.text) : extractCards(n.text)
        const fresh = drafts.filter((d) => !existing.has(d.front.toLowerCase()))
        fresh.forEach((d) => existing.add(d.front.toLowerCase()))
        await db.cards.bulkAdd(fresh.map((d) => ({ id: newId(), noteId: n.id, ...d, ...newSchedule(), createdAt: Date.now() })))
        added += fresh.length
      }
      toast(added ? `${added} new flashcards added.` : "No new flashcards found. Try 'Term: definition' lines or Q:/A: pairs in your notes.")
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  if (mode.kind === "review") return <Review cards={due(mode.scope)} noteOf={noteOf} onExit={() => setMode({ kind: "home" })} onOpenNote={onOpenNote} />
  if (mode.kind === "quiz") return <Quiz scope={mode.scope} cards={liveCards.filter((c) => inScope(c, mode.scope))} notes={live.filter((n) => mode.scope === "all" || n.notebookId === mode.scope)} onExit={() => setMode({ kind: "home" })} />

  const scopes = [{ id: "all", name: "All notes", color: "var(--brand)" }, ...notebooks]
  return (
    <div className="view"><div className="view-inner">
      <h1>Study</h1>
      <p className="lead">ThinkInk turns your notes into flashcards and schedules each review right before you'd forget it.</p>
      <div className="stats" style={{ marginBottom: 24 }}>
        <div className="card"><div className="stat">{due("all").length}</div><div style={{ color: "var(--muted)" }}>cards due now</div></div>
        <div className="card"><div className="stat">{liveCards.length}</div><div style={{ color: "var(--muted)" }}>flashcards total</div></div>
        <div className="card"><div className="stat">{liveCards.filter((c) => c.interval >= 21).length}</div><div style={{ color: "var(--muted)" }}>mastered (3+ weeks)</div></div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {scopes.map((s) => {
          const total = liveCards.filter((c) => inScope(c, s.id)).length
          const d = due(s.id).length
          return (
            <div key={s.id} className="card" style={{ display: "grid", gap: 10 }}>
              <div className="row"><span className="dot" style={{ background: s.color }} /><strong>{s.name}</strong>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{total} cards · {d} due</span></div>
              <div className="row">
                <button className="btn btn-primary" disabled={!d} onClick={() => setMode({ kind: "review", scope: s.id })}><Icon name="play" /> Review {d || ""}</button>
                <button className="btn" disabled={total < 4 && !gemini.hasKey()} onClick={() => setMode({ kind: "quiz", scope: s.id })} title={total < 4 && !gemini.hasKey() ? "Needs 4+ flashcards (or a Gemini key)" : ""}><Icon name="check" /> Practice quiz</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => buildDeck(s.id)}><Icon name="wand" /> {busy ? "Building…" : "Make flashcards from these notes"}</button>
              </div>
            </div>
          )
        })}
      </div>
      {liveCards.length > 0 && <CardList cards={liveCards} noteOf={noteOf} />}
    </div></div>
  )
}

function Review({ cards, noteOf, onExit, onOpenNote }: { cards: Card[]; noteOf: Map<string, Note>; onExit: () => void; onOpenNote: (id: string) => void }) {
  const [queue] = useState(() => [...cards].sort(() => Math.random() - 0.5))
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [done, setDone] = useState(0)
  const card = queue[i]

  const grade = async (g: Grade) => {
    if (!card) return
    await db.cards.update(card.id, review(card, g))
    setDone((d) => d + 1)
    setFlipped(false)
    setI((x) => x + 1)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f) }
      if (flipped && ["1", "2", "3", "4"].includes(e.key)) grade((["again", "hard", "good", "easy"] as Grade[])[Number(e.key) - 1])
      if (e.key === "Escape") onExit()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="view"><div className="view-inner">
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={onExit}><Icon name="back" /> Study</button>
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--muted)" }}>{Math.min(i + 1, queue.length)} / {queue.length}</span>
      </div>
      <div className="progress" style={{ marginBottom: 20 }}><div style={{ width: `${(i / Math.max(queue.length, 1)) * 100}%` }} /></div>
      {card ? (
        <>
          <div className="flash" role="button" tabIndex={0} onClick={() => setFlipped(!flipped)} aria-label={flipped ? "Answer shown" : "Show answer"}>
            <div>
              <div>{card.front}</div>
              {flipped && <div className="back">{card.back}</div>}
              {!flipped && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 18 }}>Tap or press Space to show the answer</div>}
            </div>
          </div>
          {flipped && (
            <div className="grades">
              {(["again", "hard", "good", "easy"] as Grade[]).map((g, k) => (
                <button key={g} className={`btn${g === "good" ? " btn-primary" : ""}`} onClick={() => grade(g)}>
                  <span style={{ textTransform: "capitalize" }}>{g}</span><small>{previewLabel(card, g)} · {k + 1}</small>
                </button>
              ))}
            </div>
          )}
          {noteOf.get(card.noteId) && <p style={{ textAlign: "center", fontSize: 13 }}><button className="btn btn-ghost" onClick={() => onOpenNote(card.noteId)}>From: {displayTitle(noteOf.get(card.noteId)!)}</button></p>}
        </>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40 }}>🎉</div>
          <h2>Session complete</h2>
          <p className="lead">You reviewed {done} card{done === 1 ? "" : "s"}. ThinkInk will bring each one back right before you'd forget it.</p>
          <button className="btn btn-primary" onClick={onExit}>Done</button>
        </div>
      )}
    </div></div>
  )
}

function Quiz({ scope, cards, notes, onExit }: { scope: string; cards: Card[]; notes: Note[]; onExit: () => void }) {
  const [qs, setQs] = useState<QuizQ[] | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qs = gemini.hasKey() && notes.length
          ? await gemini.makeQuiz(notes.map((n) => `# ${displayTitle(n)}\n${n.text}`).join("\n\n"))
          : cardQuiz(cards)
        if (!cancelled) setQs(qs.length ? qs : cardQuiz(cards))
      } catch (e) {
        if (!cancelled) { setError((e as Error).message); setQs(cardQuiz(cards)) }
      }
    })()
    return () => { cancelled = true }
  }, [scope]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!qs) return <div className="view"><div className="view-inner"><p className="lead">Writing your quiz…</p><div className="progress"><div style={{ width: "40%" }} /></div></div></div>
  const q = qs[i]
  return (
    <div className="view"><div className="view-inner">
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn btn-ghost" onClick={onExit}><Icon name="back" /> Study</button>
        <span style={{ flex: 1 }} /><span style={{ color: "var(--muted)" }}>Score {score} / {qs.length}</span>
      </div>
      {error && <p className="notice">AI quiz unavailable ({error}). Here's a quiz from your flashcards instead.</p>}
      {q ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>Question {i + 1} of {qs.length}</div>
          <h2 style={{ margin: "0 0 6px", fontSize: 20 }}>{q.question}</h2>
          {q.choices.map((c, k) => (
            <button key={k} className={`btn choice${picked !== null && k === q.answer ? " right" : ""}${picked === k && k !== q.answer ? " wrong" : ""}`}
              disabled={picked !== null} onClick={() => { setPicked(k); if (k === q.answer) setScore((s) => s + 1) }}>
              <strong>{"ABCD"[k]}.</strong> {c}
            </button>
          ))}
          {picked !== null && (
            <>
              <p style={{ margin: 0 }}>{picked === q.answer ? "✅ Correct!" : "❌ Not quite."} {q.why}</p>
              <button className="btn btn-primary" onClick={() => { setPicked(null); setI(i + 1) }}>{i + 1 < qs.length ? "Next question" : "See results"}</button>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <h2>You scored {score} of {qs.length}</h2>
          <p className="lead">{score === qs.length ? "Perfect! You know this material." : "Review the cards you missed, then try again."}</p>
          <button className="btn btn-primary" onClick={onExit}>Done</button>
        </div>
      )}
    </div></div>
  )
}

/** Offline quiz: each card's answer plus three other cards' answers as choices. */
export function cardQuiz(cards: Card[], count = 8): QuizQ[] {
  if (cards.length < 4) return []
  const pool = [...cards].sort(() => Math.random() - 0.5).slice(0, count)
  return pool.map((c) => {
    const others = cards.filter((o) => o.id !== c.id && o.back !== c.back).sort(() => Math.random() - 0.5).slice(0, 3).map((o) => o.back)
    const choices = [...others, c.back].sort(() => Math.random() - 0.5)
    return { question: c.front, choices, answer: choices.indexOf(c.back) }
  })
}

function CardList({ cards, noteOf }: { cards: Card[]; noteOf: Map<string, Note> }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="card" style={{ marginTop: 24 }} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Manage flashcards ({cards.length})</summary>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {cards.map((c) => (
            <div key={c.id} className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{c.front}</div>
                <div style={{ color: "var(--muted)", fontSize: 14 }}>{c.back}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{displayTitle(noteOf.get(c.noteId) ?? { title: "", text: "" })} · next review {new Date(c.due).toLocaleDateString()}</div>
              </div>
              <button className="icon-btn" onClick={() => db.cards.delete(c.id)} aria-label="Delete flashcard"><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
    </details>
  )
}
