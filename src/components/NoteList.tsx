import { useMemo, useState } from "react"
import { emptyTrash, restoreNote, deleteNoteForever, type Note, type Notebook } from "../lib/db"
import { displayTitle, keywordScore, snippet } from "../lib/text"
import type { View } from "./Sidebar"
import { Icon } from "./Icon"

type Props = {
  view: Extract<View, { kind: "notes" }>
  notes: Note[]
  notebooks: Notebook[]
  selectedId: string | null
  onSelect: (id: string) => void
  onMenu: () => void
  onNew: () => void
}

type Sort = "updated" | "created" | "title"

export function NoteList({ view, notes, notebooks, selectedId, onSelect, onMenu, onNew }: Props) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("updated")
  const nbName = (id: string | null) => notebooks.find((n) => n.id === id)?.name

  const title =
    view.filter === "all" ? "All notes" : view.filter === "pinned" ? "Pinned" : view.filter === "trash" ? "Trash"
    : view.filter === "tag" ? `#${view.id}` : nbName(view.id ?? null) ?? "Notebook"

  const shown = useMemo(() => {
    let list = notes.filter((n) => (view.filter === "trash" ? n.deletedAt !== null : n.deletedAt === null))
    if (view.filter === "pinned") list = list.filter((n) => n.pinned)
    if (view.filter === "notebook") list = list.filter((n) => n.notebookId === view.id)
    if (view.filter === "tag") list = list.filter((n) => n.tags.includes(view.id!))
    const q = query.trim()
    if (q) {
      return list
        .map((n) => ({ n, s: keywordScore(q, { ...n, title: displayTitle(n), transcriptText: n.transcript.map((t) => t.text).join(" ") }) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.n)
    }
    const by = sort === "title" ? (a: Note, b: Note) => displayTitle(a).localeCompare(displayTitle(b))
      : sort === "created" ? (a: Note, b: Note) => b.createdAt - a.createdAt
      : (a: Note, b: Note) => b.updatedAt - a.updatedAt
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || by(a, b))
  }, [notes, view, query, sort])

  return (
    <section className="list-pane" aria-label={title}>
      <div className="list-head">
        <div className="list-title">
          <button className="icon-btn mobile-only" onClick={onMenu} aria-label="Open menu"><Icon name="menu" /></button>
          <span>{title}</span><span className="count">{shown.length}</span>
          <span style={{ flex: 1 }} />
          {view.filter === "trash"
            ? shown.length > 0 && <button className="btn btn-ghost btn-danger" onClick={() => confirm("Permanently delete everything in Trash?") && emptyTrash()}>Empty</button>
            : <button className="icon-btn" onClick={onNew} aria-label="New note" title="New note (Ctrl+Alt+N)"><Icon name="plus" /></button>}
        </div>
        <div className="search">
          <Icon name="search" />
          <input className="input" type="search" placeholder="Search notes, tags, transcripts…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
        </div>
        {!query && (
          <select className="input" style={{ padding: "5px 8px", fontSize: 13 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort notes">
            <option value="updated">Recently edited</option>
            <option value="created">Recently created</option>
            <option value="title">Title A–Z</option>
          </select>
        )}
      </div>
      <div className="list-scroll">
        {shown.length === 0 && (
          <div className="empty">
            {query ? <><h3>No matches</h3><p>Try other words, or ask by meaning in "Ask your notes".</p></>
              : view.filter === "trash" ? <><h3>Trash is empty</h3><p>Deleted notes wait here until you empty it.</p></>
              : <><h3>No notes here yet</h3><button className="btn btn-primary" onClick={onNew}><Icon name="plus" /> New note</button></>}
          </div>
        )}
        {shown.map((n) => (
          <div key={n.id} style={{ display: "grid" }}>
            <button className="note-card" aria-current={n.id === selectedId} onClick={() => onSelect(n.id)}>
              {n.color && <span className="color-bar" style={{ background: n.color }} />}
              <h3>{n.pinned && <Icon name="pin" size={13} />}<span>{displayTitle(n)}</span></h3>
              <p>{query ? snippet(n.text, query) : n.text.split("\n").slice(n.title ? 0 : 1).join(" ").slice(0, 140) || "No text yet"}</p>
              <div className="note-meta">
                <span>{new Date(n.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                {nbName(n.notebookId) && <span>· {nbName(n.notebookId)}</span>}
                {n.audioId && <span title="Has a recording">· <Icon name="mic" size={12} /></span>}
                {n.ink.length > 0 && <span title="Has drawings">· <Icon name="pen" size={12} /></span>}
                {n.tags.slice(0, 3).map((t) => <span key={t} className="pill">#{t}</span>)}
              </div>
            </button>
            {view.filter === "trash" && (
              <div className="row" style={{ padding: "4px 6px 8px" }}>
                <button className="btn" onClick={() => restoreNote(n.id)}><Icon name="undo" /> Restore</button>
                <button className="btn btn-ghost btn-danger" onClick={() => confirm("Delete this note forever?") && deleteNoteForever(n.id)}>Delete forever</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
