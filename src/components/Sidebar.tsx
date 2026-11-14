import { useState } from "react"
import { createNotebook, deleteNotebook, type Note, type Notebook } from "../lib/db"
import { TEMPLATES, type Template } from "../lib/templates"
import { NOTE_COLORS } from "./NoteEditor"
import { Icon } from "./Icon"

export type View =
  | { kind: "notes"; filter: "all" | "pinned" | "trash" | "notebook" | "tag"; id?: string }
  | { kind: "study" } | { kind: "ask" } | { kind: "graph" } | { kind: "settings" }

type Props = {
  view: View
  setView: (v: View) => void
  notes: Note[]
  notebooks: Notebook[]
  dueCount: number
  onNew: (t?: Template) => void
  theme: string
  toggleTheme: () => void
}

export function Sidebar({ view, setView, notes, notebooks, dueCount, onNew, theme, toggleTheme }: Props) {
  const [menu, setMenu] = useState(false)
  const live = notes.filter((n) => !n.deletedAt)
  const tags = [...new Set(live.flatMap((n) => n.tags))].sort()
  const is = (v: Partial<View> & { kind: string }) =>
    view.kind === v.kind && (v.kind !== "notes" || (view.kind === "notes" && view.filter === (v as { filter: string }).filter && view.id === (v as { id?: string }).id))
  const item = (v: View, icon: React.ReactNode, label: string, extra?: React.ReactNode) => (
    <button className="nav-item" aria-current={is(v)} onClick={() => setView(v)}>{icon}<span>{label}</span>{extra}</button>
  )
  const addNotebook = async () => {
    const name = prompt("Notebook name (for example a class: \"BIO 101\")")
    if (!name?.trim()) return
    const nb = await createNotebook(name, NOTE_COLORS[notebooks.length % NOTE_COLORS.length])
    setView({ kind: "notes", filter: "notebook", id: nb.id })
  }

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand"><img src="./favicon.svg" alt="" /> ThinkInk</div>
      <div className="new-btn" style={{ position: "relative" }}>
        <button className="btn btn-primary" onClick={() => onNew()}><Icon name="plus" /> New note</button>
        <button className="btn btn-primary menu-trigger" onClick={() => setMenu(!menu)} aria-label="New note from template" aria-expanded={menu}>▾</button>
        {menu && (
          <div className="menu" style={{ left: 0, right: 0, top: 44 }} onClick={() => setMenu(false)}>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => onNew(t)} style={{ display: "grid", gap: 0 }}>
                <strong style={{ fontWeight: 600 }}>{t.name}</strong>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{t.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="side-scroll">
        {item({ kind: "notes", filter: "all" }, <Icon name="note" />, "All notes", <span className="count">{live.length}</span>)}
        {item({ kind: "notes", filter: "pinned" }, <Icon name="pin" />, "Pinned")}
        {item({ kind: "ask" }, <Icon name="sparkles" />, "Ask your notes")}
        {item({ kind: "study" }, <Icon name="study" />, "Study", dueCount ? <span className="badge" aria-label={`${dueCount} cards due`}>{dueCount}</span> : null)}
        {item({ kind: "graph" }, <Icon name="graph" />, "Knowledge graph")}

        <div className="side-section">
          <div className="side-label">Notebooks <button className="icon-btn" onClick={addNotebook} aria-label="New notebook" title="New notebook"><Icon name="plus" size={14} /></button></div>
          {notebooks.length === 0 && <button className="nav-item" onClick={addNotebook} style={{ color: "var(--muted)" }}><Icon name="book" /> Add a class or notebook</button>}
          {notebooks.map((nb) => (
            <div key={nb.id} style={{ display: "flex", alignItems: "center" }}>
              {item({ kind: "notes", filter: "notebook", id: nb.id }, <span className="dot" style={{ background: nb.color }} />, nb.name, <span className="count">{live.filter((n) => n.notebookId === nb.id).length}</span>)}
              <button className="icon-btn" aria-label={`Delete notebook ${nb.name}`} title="Delete notebook (keeps its notes)"
                onClick={() => confirm(`Delete "${nb.name}"? Its notes stay in All notes.`) && deleteNotebook(nb.id)}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>

        {tags.length > 0 && (
          <div className="side-section">
            <div className="side-label">Tags</div>
            {tags.map((t) => item({ kind: "notes", filter: "tag", id: t }, <Icon name="tag" />, t))}
          </div>
        )}

        <div className="side-section">
          {item({ kind: "notes", filter: "trash" }, <Icon name="trash" />, "Trash", <span className="count">{notes.length - live.length || ""}</span>)}
          {item({ kind: "settings" }, <Icon name="settings" />, "Settings & backup")}
          <button className="nav-item" onClick={toggleTheme}><Icon name={theme === "dark" ? "sun" : "moon"} /> {theme === "dark" ? "Light mode" : "Dark mode"}</button>
        </div>
      </div>
    </nav>
  )
}
