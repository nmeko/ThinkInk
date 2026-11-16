import { useEffect, useRef, useState } from "react"

// Study-friendly icons for notes, grouped loosely by subject.
const ICONS = ["📝", "📚", "🧠", "💡", "🧪", "🧬", "🔬", "🌍", "📐", "➗", "💻", "🤖", "🎨", "🎵", "📜", "⚖️", "💰", "🏛️", "🗣️", "✍️", "📅", "✅", "⭐", "🔥", "🌱", "🚀", "🎯", "❤️", "☕", "🧩", "🎓", "📌"]

/** Big emoji on the note header; tap to choose another (or remove it). */
export function IconPicker({ value, onChange }: { value?: string; onChange: (icon: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    box.current?.querySelector("button")?.focus()
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", close)
    document.addEventListener("mousedown", close)
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close) }
  }, [open])
  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn-big" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={value ? `Note icon ${value}. Change icon` : "Add an icon"}>
        {value ?? <span style={{ fontSize: 28, opacity: .55 }} aria-hidden="true">＋</span>}
      </button>
      {open && (
        <div ref={box} className="emoji-pop" role="listbox" aria-label="Choose an icon">
          {ICONS.map((i) => <button key={i} role="option" aria-selected={i === value} onClick={() => { onChange(i); setOpen(false) }}>{i}</button>)}
          {value && <button onClick={() => { onChange(undefined); setOpen(false) }} aria-label="Remove icon" style={{ gridColumn: "span 2", fontSize: 13 }}>Remove</button>}
        </div>
      )}
    </div>
  )
}
