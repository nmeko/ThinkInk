import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import * as gemini from "../lib/ai/gemini"
import { markdownToHtml } from "../lib/markdown"
import { Icon } from "./Icon"

type InkyAction = "explain" | "detailed" | "cards" | "sources" | "visual" | "quiz" | "ask" | "import"

/** Note actions are picked up by the open note's editor (same pattern as "thinkink-seek"). */
const inkyEvent = (action: InkyAction) => window.dispatchEvent(new CustomEvent("thinkink-inky", { detail: action }))

/** Inky: an ink drop with a face. Drawn here, so it's ThinkInk's own character. */
export function InkyFace({ size = 56, blink = true }: { size?: number; blink?: boolean }) {
  return (
    <svg width={size} height={size * 1.12} viewBox="0 0 64 72" aria-hidden="true" className="inky-face">
      <defs>
        <linearGradient id="inky-ink" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#5466f0" />
          <stop offset="1" stopColor="#24308f" />
        </linearGradient>
      </defs>
      <path d="M32 3C32 3 7 33 7 47a25 25 0 0 0 50 0C57 33 32 3 32 3Z" fill="url(#inky-ink)" />
      <ellipse cx="21" cy="31" rx="3.2" ry="7" fill="#fff" opacity=".32" transform="rotate(-24 21 31)" />
      <g className={blink ? "inky-eyes" : undefined}>
        <ellipse cx="24" cy="45" rx="5.4" ry="6.2" fill="#fff" />
        <ellipse cx="40" cy="45" rx="5.4" ry="6.2" fill="#fff" />
        <circle cx="25.2" cy="46.2" r="2.8" fill="#151b45" />
        <circle cx="41.2" cy="46.2" r="2.8" fill="#151b45" />
      </g>
      <circle cx="16.5" cy="54" r="3.6" fill="var(--hl)" opacity=".9" />
      <circle cx="47.5" cy="54" r="3.6" fill="var(--hl)" opacity=".9" />
      <path d="M27 55.5q5 4.5 10 0" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

type Props = {
  note?: { title: string; text: string }
  onNavigate: (action: "quiz" | "import" | "ask", q?: string) => void
}

/** The floating helper: tap Inky, say what you need, or ask it to break something down. */
export function Inky({ note, onNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState<{ q: string; html: string } | null>(null)
  const [error, setError] = useState("")
  const input = useRef<HTMLTextAreaElement>(null)
  const still = useReducedMotion()
  const ai = gemini.hasKey()

  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const act = (a: InkyAction) => {
    setOpen(false)
    if (a === "quiz" || a === "import" || a === "ask") onNavigate(a)
    else inkyEvent(a)
  }

  const breakDown = async () => {
    const question = q.trim()
    if (!question) return
    if (!ai) { setOpen(false); onNavigate("ask", question); return }
    setBusy(true); setError("")
    try {
      setReply({ q: question, html: markdownToHtml(await gemini.tutor(question, note)) })
      setQ("")
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const chips: [InkyAction, string][] = note
    ? [["explain", "Break down this note"], ["cards", "Make flashcards from it"], ["quiz", "Quiz me"], ["sources", "Find sources and videos"], ["visual", "Draw a diagram"], ["detailed", "Detailed study guide"]]
    : [["ask", "Search my notes"], ["quiz", "Quiz me"], ["import", "Import slides or a photo"]]

  return (
    <div className="inky">
      <AnimatePresence>
        {open && (
          <motion.div
            className="inky-panel"
            role="dialog"
            aria-label="Inky, your study helper"
            initial={still ? false : { opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 10 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <div className="inky-head">
              <strong>Hi, I'm Inky!</strong>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close Inky"><Icon name="x" /></button>
            </div>
            <p className="inky-say">{note ? `What do you need help with in "${note.title || "this note"}"?` : "What do you need help with?"}</p>
            <div className="chips">
              {chips.map(([a, label]) => <button key={a} className="chip" onClick={() => act(a)}>{label}</button>)}
            </div>

            {reply && (
              <div className="inky-reply" aria-live="polite">
                <p className="inky-you">{reply.q}</p>
                <div className="md" dangerouslySetInnerHTML={{ __html: reply.html }} />
                {note && (
                  <button className="btn btn-ghost" onClick={() => { window.dispatchEvent(new CustomEvent("thinkink-insert", { detail: `<h2>${reply.q.replace(/[<>&]/g, "")}</h2>${reply.html}` })); setOpen(false) }}>
                    <Icon name="plus" /> Add to my note
                  </button>
                )}
              </div>
            )}
            {error && <p className="notice error" role="alert" style={{ margin: 0 }}>{error}</p>}

            <form onSubmit={(e) => { e.preventDefault(); void breakDown() }} className="inky-ask">
              <label htmlFor="inky-q" className="sr-only">What do you want broken down?</label>
              <textarea id="inky-q" ref={input} className="input" rows={2} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="What do you want broken down? e.g. How does photosynthesis work?"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void breakDown() } }} />
              <button className="btn btn-primary" disabled={busy || !q.trim()}>{busy ? "Thinking…" : ai ? "Break it down" : "Search my notes"}</button>
            </form>
            {!ai && <p className="inky-tip">Add a free Gemini key in Settings and I can explain anything in plain words, not just search your notes.</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        className="inky-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close Inky, your study helper" : "Open Inky, your study helper"}
        animate={still || open ? { y: 0 } : { y: [0, -5, 0] }}
        transition={still || open ? { duration: 0.2 } : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        whileHover={still ? undefined : { rotate: [0, -8, 6, 0], transition: { duration: 0.5 } }}
        whileTap={{ scale: 0.9 }}
      >
        <InkyFace size={46} />
      </motion.button>
    </div>
  )
}
