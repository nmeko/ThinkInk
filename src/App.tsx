import { useCallback, useEffect, useState } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db, createNote, type Note } from "./lib/db"
import { decodeShare, type SharedNote } from "./lib/share"
import { TEMPLATES, today, type Template } from "./lib/templates"
import { displayTitle } from "./lib/text"
import { onToast, toast } from "./lib/toast"
import { Sidebar, type View } from "./components/Sidebar"
import { NoteList } from "./components/NoteList"
import { NoteEditor } from "./components/NoteEditor"
import { StudyView } from "./components/StudyView"
import { AskView } from "./components/AskView"
import { GraphView } from "./components/GraphView"
import { SettingsView } from "./components/SettingsView"
import { CommandPalette } from "./components/CommandPalette"
import { ShareImport } from "./components/ShareImport"
import { Icon } from "./components/Icon"
import { WELCOME } from "./lib/welcome"

const store = {
  get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } },
}

function readShare(): SharedNote | "invalid" | null {
  const m = location.hash.match(/^#share=(.+)$/)
  return m ? decodeShare(m[1]) ?? "invalid" : null
}

export default function App() {
  const notes = useLiveQuery(() => db.notes.toArray(), []) ?? []
  const notebooks = useLiveQuery(() => db.notebooks.orderBy("createdAt").toArray(), []) ?? []
  const dueCount = useLiveQuery(() => db.cards.where("due").belowOrEqual(Date.now()).count(), []) ?? 0
  const [view, setViewRaw] = useState<View>({ kind: "notes", filter: "all" })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pane, setPane] = useState<"nav" | "list" | "main">("list")
  const [palette, setPalette] = useState(false)
  const [shared, setShared] = useState(readShare)
  const [message, setMessage] = useState<string | null>(null)
  const [theme, setTheme] = useState(() => store.get("thinkink-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"))

  useEffect(() => { document.documentElement.dataset.theme = theme; store.set("thinkink-theme", theme) }, [theme])
  useEffect(() => onToast((m) => { setMessage(m); window.setTimeout(() => setMessage((x) => (x === m ? null : x)), 3200) }), [])

  // First visit: one note that shows what ThinkInk can do.
  useEffect(() => {
    if (store.get("thinkink-welcomed")) return
    store.set("thinkink-welcomed", "1")
    db.notes.count().then(async (n) => { if (n === 0) await createNote({ title: "Welcome to ThinkInk", content: WELCOME, pinned: true, tags: ["start-here"] }).then((w) => setSelectedId(w.id)) })
  }, [])

  const setView = useCallback((v: View) => { setViewRaw(v); setPane(v.kind === "notes" ? "list" : "main") }, [])
  const openNote = useCallback((id: string) => { setSelectedId(id); setViewRaw((v) => (v.kind === "notes" && v.filter !== "trash" ? v : { kind: "notes", filter: "all" })); setPane("main") }, [])

  const newNote = useCallback(async (t?: Template | string) => {
    const tpl = typeof t === "object" ? t : TEMPLATES[0]
    const notebookId = view.kind === "notes" && view.filter === "notebook" ? view.id ?? null : null
    const tags = view.kind === "notes" && view.filter === "tag" && view.id ? [view.id] : []
    const n = await createNote({ title: typeof t === "string" ? t : tpl.title(today()), content: tpl.content, notebookId, tags })
    openNote(n.id)
  }, [view, openNote])

  const openTitle = useCallback(async (title: string) => {
    const hit = notes.find((n) => !n.deletedAt && displayTitle(n).toLowerCase() === title.toLowerCase())
    if (hit) return openNote(hit.id)
    const n = await createNote({ title })
    toast(`Created "${title}"`)
    openNote(n.id)
  }, [notes, openNote])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p) }
      if (mod && e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); newNote() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [newNote])

  const closeShare = () => { history.replaceState(null, "", location.pathname + location.search); setShared(null) }
  const saveShare = async () => {
    if (!shared || shared === "invalid") return
    const n = await createNote({ title: shared.title, content: shared.content, tags: shared.tags, ink: shared.ink })
    closeShare(); toast("Saved to your notes."); openNote(n.id)
  }

  const selected: Note | undefined = notes.find((n) => n.id === selectedId)
  const wide = view.kind !== "notes"

  return (
    <>
      <div className={`app${wide ? " wide" : ""}`} data-mobile={pane}>
        <Sidebar view={view} setView={setView} notes={notes} notebooks={notebooks} dueCount={dueCount} onNew={(t) => newNote(t)}
          theme={theme} toggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
        {view.kind === "notes" && (
          <NoteList view={view} notes={notes} notebooks={notebooks} selectedId={selectedId} onSelect={openNote} onMenu={() => setPane("nav")} onNew={() => newNote()} />
        )}
        <main className="main-pane">
          {wide && <button className="icon-btn mobile-only" style={{ margin: 8 }} onClick={() => setPane("nav")} aria-label="Open menu"><Icon name="menu" /></button>}
          {view.kind === "study" ? <StudyView notes={notes} notebooks={notebooks} onOpenNote={openNote} />
            : view.kind === "ask" ? <AskView notes={notes} onOpenNote={openNote} />
            : view.kind === "graph" ? <GraphView notes={notes} notebooks={notebooks} onOpenNote={openNote} />
            : view.kind === "settings" ? <SettingsView />
            : selected ? <NoteEditor noteId={selected.id} notes={notes} notebooks={notebooks} onOpenTitle={openTitle} onOpenNote={openNote} onBack={() => setPane("list")} />
            : (
              <div className="empty" style={{ margin: "auto" }}>
                <Icon name="note" size={40} />
                <h3>Pick a note or start a new one</h3>
                <p>Tip: press <kbd>Ctrl</kbd> <kbd>K</kbd> to search everything.</p>
                <button className="btn btn-primary" onClick={() => newNote()}><Icon name="plus" /> New note</button>
              </div>
            )}
        </main>
      </div>
      {palette && <CommandPalette notes={notes} onClose={() => setPalette(false)} onOpenNote={openNote} onNew={(t) => newNote(t)} setView={setView} />}
      {shared && <ShareImport shared={shared} onSave={saveShare} onDismiss={closeShare} />}
      {message && <div className="toast" role="status">{message}</div>}
    </>
  )
}
