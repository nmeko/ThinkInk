import { useEffect, useState } from "react"
import type { Editor } from "@tiptap/react"

type Item = { glyph: string; label: string; hint: string; run: (e: Editor) => void }
const c = (e: Editor) => e.chain().focus()
const ITEMS: Item[] = [
  { glyph: "H1", label: "Heading 1", hint: "Big section title", run: (e) => c(e).setHeading({ level: 1 }).run() },
  { glyph: "H2", label: "Heading 2", hint: "Medium section title", run: (e) => c(e).setHeading({ level: 2 }).run() },
  { glyph: "H3", label: "Heading 3", hint: "Small section title", run: (e) => c(e).setHeading({ level: 3 }).run() },
  { glyph: "•", label: "Bullet list", hint: "A simple list", run: (e) => c(e).toggleBulletList().run() },
  { glyph: "1.", label: "Numbered list", hint: "Steps in order", run: (e) => c(e).toggleOrderedList().run() },
  { glyph: "☑", label: "Checklist", hint: "Things to do", run: (e) => c(e).toggleTaskList().run() },
  { glyph: "❝", label: "Quote", hint: "Pull out a quote", run: (e) => c(e).toggleBlockquote().run() },
  { glyph: "<>", label: "Code", hint: "Code or formulas", run: (e) => c(e).toggleCodeBlock().run() },
  { glyph: "—", label: "Divider", hint: "A line between ideas", run: (e) => c(e).setHorizontalRule().run() },
]

/** Exported for tests: items whose name starts a word with the typed query. */
export const matchSlash = (q: string) => ITEMS.filter((it) => !q || it.label.toLowerCase().split(/\s+/).some((w) => w.startsWith(q.toLowerCase())))

/** Type "/" at the start of a line to pick a block, like Notion. */
export function SlashMenu({ editor }: { editor: Editor }) {
  const [state, setState] = useState<{ q: string; x: number; y: number } | null>(null)
  const [sel, setSel] = useState(0)
  const items = state ? matchSlash(state.q) : []

  useEffect(() => {
    const check = () => {
      const { $from, empty } = editor.state.selection
      const before = $from.parent.textBetween(0, $from.parentOffset)
      const m = empty && $from.parent.type.name === "paragraph" ? before.match(/^\/(\w*)$/) : null
      if (!m) return setState(null)
      const at = editor.view.coordsAtPos(editor.state.selection.from)
      setState({ q: m[1], x: at.left, y: at.bottom + 6 })
      setSel((s) => (m[1] ? 0 : s))
    }
    editor.on("transaction", check)
    return () => { editor.off("transaction", check) }
  }, [editor])

  const choose = (it?: Item) => {
    if (!it) return
    const { $from } = editor.state.selection
    editor.chain().focus().deleteRange({ from: $from.start(), to: $from.pos }).run()
    it.run(editor)
    setState(null)
  }

  useEffect(() => {
    if (!state || !items.length) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length) }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); choose(items[sel]) }
      else if (e.key === "Escape") { e.preventDefault(); setState(null) }
    }
    window.addEventListener("keydown", onKey, true) // capture, so the editor doesn't also get Enter
    return () => window.removeEventListener("keydown", onKey, true)
  })

  if (!state || !items.length) return null
  return (
    <div className="slash-menu" role="listbox" aria-label="Insert a block"
      style={{ left: Math.min(state.x, innerWidth - 276), top: state.y + 330 > innerHeight ? state.y - 340 : state.y }}>
      {items.map((it, k) => (
        <button key={it.label} role="option" aria-selected={k === sel} onMouseEnter={() => setSel(k)} onMouseDown={(e) => { e.preventDefault(); choose(it) }}>
          <span className="glyph" aria-hidden="true">{it.glyph}</span><strong>{it.label}</strong><small>{it.hint}</small>
        </button>
      ))}
    </div>
  )
}
