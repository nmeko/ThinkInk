import { useEffect, useMemo, useRef, useState } from "react"
import type { Note } from "../lib/db"
import { displayTitle, keywordScore } from "../lib/text"
import type { View } from "./Sidebar"
import { Icon } from "./Icon"

type Item = { id: string; label: string; hint?: string; icon: string; run: () => void }

export function CommandPalette({ notes, onClose, onOpenNote, onNew, setView }: {
  notes: Note[]; onClose: () => void; onOpenNote: (id: string) => void; onNew: (title?: string) => void; setView: (v: View) => void
}) {
  const [q, setQ] = useState("")
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const items = useMemo<Item[]>(() => {
    const live = notes.filter((n) => !n.deletedAt)
    const found = (q ? live.map((n) => ({ n, s: keywordScore(q, { ...n, title: displayTitle(n) }) })).filter((x) => x.s).sort((a, b) => b.s - a.s).map((x) => x.n)
      : [...live].sort((a, b) => b.updatedAt - a.updatedAt)).slice(0, 8)
    const actions: Item[] = [
      { id: "new", label: q ? `New note "${q}"` : "New note", icon: "plus", run: () => onNew(q || undefined) },
      { id: "ask", label: q ? `Ask your notes: "${q}"` : "Ask your notes", icon: "sparkles", run: () => setView({ kind: "ask", q: q || undefined }) },
      { id: "study", label: "Study flashcards", icon: "study", run: () => setView({ kind: "study" }) },
      { id: "graph", label: "Knowledge graph", icon: "graph", run: () => setView({ kind: "graph" }) },
    ]
    return [...found.map((n) => ({ id: n.id, label: displayTitle(n), hint: new Date(n.updatedAt).toLocaleDateString(), icon: "note", run: () => onOpenNote(n.id) })), ...actions]
  }, [q, notes, onNew, onOpenNote, setView])

  const go = (it?: Item) => { if (it) { it.run(); onClose() } }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <input ref={input} className="input" value={q} placeholder="Search notes or type a command…" aria-label="Search notes or commands"
          onChange={(e) => { setQ(e.target.value); setSel(0) }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)) }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
            if (e.key === "Enter") go(items[sel])
            if (e.key === "Escape") onClose()
          }} />
        <ul role="listbox" aria-label="Results">
          {items.map((it, i) => (
            <li key={it.id}>
              <button role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(it)}>
                <Icon name={it.icon} /> <span style={{ flex: 1 }}>{it.label}</span>{it.hint && <span style={{ fontSize: 12, color: "var(--muted)" }}>{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
