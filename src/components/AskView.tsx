import { useEffect, useState } from "react"
import type { Note } from "../lib/db"
import { displayTitle } from "../lib/text"
import { semanticSearch, bestPassages } from "../lib/ai/local"
import * as gemini from "../lib/ai/gemini"
import { Icon } from "./Icon"

type Result = { question: string; notes: Note[]; passages: { noteId: string; text: string }[]; answer: string | null; error?: string }

const EXAMPLES = ["What are the main ideas from my last lecture?", "Explain the difference between mitosis and meiosis", "What do I still need to do this week?"]

export function AskView({ notes, onOpenNote, initial }: { notes: Note[]; onOpenNote: (id: string) => void; initial?: string }) {
  const [q, setQ] = useState(initial ?? "")
  const [busy, setBusy] = useState(false)
  const [pct, setPct] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const live = notes.filter((n) => !n.deletedAt)

  const ask = async (question: string) => {
    if (!question.trim()) return
    setBusy(true); setPct(0)
    try {
      const hits = await semanticSearch(question, 6, setPct)
      const found = hits.filter((h) => h.score > 0.15).map((h) => live.find((n) => n.id === h.noteId)).filter(Boolean) as Note[]
      const passages = await bestPassages(question, found.slice(0, 4))
      let answer: string | null = null, error: string | undefined
      if (gemini.hasKey() && found.length) {
        try { answer = await gemini.answer(question, found.slice(0, 5).map((n) => ({ title: displayTitle(n), text: n.text + "\n" + n.transcript.map((t) => t.text).join(" ") }))) }
        catch (e) { error = (e as Error).message }
      }
      setResult({ question, notes: found, passages, answer, error })
    } catch (e) {
      setResult({ question, notes: [], passages: [], answer: null, error: `The on-device AI couldn't load (${(e as Error).message}). Check your connection for the one-time model download.` })
    } finally { setBusy(false) }
  }

  // A question handed over from Inky or the command palette runs right away.
  useEffect(() => { if (initial) void ask(initial) }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="view"><div className="view-inner">
      <h1>Ask your notes</h1>
      <p className="lead">Search by meaning, not exact words. ThinkInk finds the right notes and passages {gemini.hasKey() ? "and writes an answer with sources." : "on your device. Add a free Gemini key in Settings for written answers."}</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); ask(q) }}>
        <input className="input" style={{ flex: 1, minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything about your notes…" aria-label="Question" />
        <button className="btn btn-primary" disabled={busy || !q.trim()}><Icon name="sparkles" /> Ask</button>
      </form>
      {!result && !busy && (
        <div className="chips" style={{ marginTop: 14 }}>
          {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => { setQ(e); ask(e) }}>{e}</button>)}
        </div>
      )}
      {live.length === 0 && <p className="notice" style={{ marginTop: 16 }}>Write a few notes first. Then ask questions about them here.</p>}
      {busy && (
        <div style={{ marginTop: 20 }} aria-live="polite">
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{pct > 0 && pct < 100 ? `Downloading the on-device AI model (${pct}%), first time only…` : "Reading your notes…"}</p>
          <div className="progress"><div style={{ width: `${pct > 0 ? pct : 35}%` }} /></div>
        </div>
      )}
      {result && !busy && (
        <div style={{ display: "grid", gap: 16, marginTop: 22 }}>
          {result.error && <p className="notice error">{result.error}</p>}
          {result.answer && (
            <div className="ai-box">
              <strong>Answer</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{result.answer}</div>
              <div className="chips" style={{ marginTop: 10 }}>
                {result.notes.slice(0, 5).map((n, i) => <button key={n.id} className="chip" onClick={() => onOpenNote(n.id)}>[{i + 1}] {displayTitle(n)}</button>)}
              </div>
            </div>
          )}
          {result.passages.length > 0 && (
            <div className="card">
              <strong>Best matching passages</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {result.passages.map((p, i) => {
                  const n = result.notes.find((x) => x.id === p.noteId)
                  return (
                    <button key={i} className="btn btn-ghost" style={{ display: "grid", textAlign: "left", whiteSpace: "normal", justifyItems: "start" }} onClick={() => onOpenNote(p.noteId)}>
                      <span>“{p.text}”</span>
                      <span style={{ fontSize: 12, color: "var(--brand)" }}>{n ? displayTitle(n) : ""}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {!result.notes.length && !result.error && <p className="notice">No notes seem related to that yet.</p>}
        </div>
      )}
    </div></div>
  )
}
