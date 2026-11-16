import { useEffect, useRef } from "react"
import { motion, useReducedMotion } from "motion/react"
import { InkyFace } from "./Inky"
import { Icon } from "./Icon"

const LINES = ["Plants make their own food.", "Chlorophyll catches sunlight", "and turns it into chemical energy", "stored as glucose."]

/** First screen for new visitors: one short demo of a note becoming a flashcard, then into the app. */
export function Intro({ onStart, onTour }: { onStart: () => void; onTour: () => void }) {
  const still = useReducedMotion()
  const start = useRef<HTMLButtonElement>(null)
  useEffect(() => start.current?.focus(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onStart()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onStart])
  const t = (s: number) => (still ? { duration: 0 } : { delay: s, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const })

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-copy">
        <div className="brand"><img src="./favicon.svg" alt="" /> ThinkInk</div>
        <h1 id="intro-title">Write it down once. Remember it for the exam.</h1>
        <p className="lead">ThinkInk is a free note app that turns your notes into flashcards, quizzes and plain-English explanations. Your notes stay in this browser. No account, no sign-up.</p>
        <div className="row">
          <button ref={start} className="btn btn-primary btn-lg" onClick={onStart}><Icon name="pen" /> Start writing</button>
          <button className="btn btn-ghost btn-lg" onClick={onTour}>Show me around</button>
        </div>
        <ul className="intro-facts">
          <li><Icon name="lock" size={16} /> Private: notes never leave your device unless you share them</li>
          <li><Icon name="check" size={16} /> Works offline, after the first visit</li>
          <li><Icon name="sparkles" size={16} /> Inky, a study helper, explains anything you tap</li>
        </ul>
      </div>

      <div className="intro-demo" aria-hidden="true">
        <motion.div className="demo-note" initial={still ? false : { opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: -1.5 }} transition={t(0.1)}>
          <div className="demo-title">🌱 Photosynthesis</div>
          {LINES.map((l, k) => (
            <motion.p key={k} initial={still ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={t(0.5 + k * 0.35)}>
              {k === 2 ? <>and turns it into <motion.mark className="demo-mark" initial={still ? false : { backgroundSize: "0% 72%" }} animate={{ backgroundSize: "100% 72%" }} transition={t(2.3)}>chemical energy</motion.mark></> : l}
            </motion.p>
          ))}
        </motion.div>
        <motion.div className="demo-card" initial={still ? false : { opacity: 0, y: 40, rotateX: 50 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={still ? { duration: 0 } : { delay: 3.1, type: "spring", stiffness: 160, damping: 18 }}>
          <small>Flashcard</small>
          What does chlorophyll turn light energy into?
        </motion.div>
        <motion.div className="demo-inky" initial={still ? false : { opacity: 0, scale: 0.4, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={still ? { duration: 0 } : { delay: 4, type: "spring", stiffness: 300, damping: 14 }}>
          <span className="demo-bubble">Want it in simpler words?</span>
          <InkyFace size={54} />
        </motion.div>
      </div>
    </div>
  )
}
