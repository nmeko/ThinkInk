import { useRef, useState } from "react"
import { createNote } from "../lib/db"
import { ACCEPT, htmlToDoc, importFile } from "../lib/importers"
import { photoToNote } from "../lib/ai/ocr"
import { hasKey } from "../lib/ai/gemini"
import { Modal } from "./Modal"
import { Icon } from "./Icon"

type Done = { id: string; title: string }

// How to get notes out of other apps. Direct sign-in to those apps would need a server and
// their developer approval; their own export buttons work today and keep everything private.
const HOW_TO = [
  ["Notion", "••• menu on a page (or Settings → Export) → Markdown & CSV → upload the .zip"],
  ["Google Docs", "File → Download → Microsoft Word (.docx) or Markdown (.md)"],
  ["OneNote", "File → Export → Word document (.docx), or print the page to PDF"],
  ["Evernote", "Select notes → ••• → Export → ENEX file (.enex)"],
  ["Apple Notes", "File → Export as PDF, or Share → copy the text into a new note"],
  ["Obsidian / Bear / Joplin", "Export or zip your Markdown folder (.md or .zip)"],
  ["GoodNotes / Notability", "Export the notebook as PDF, or take photos of the pages"],
  ["Lecture slides", "PowerPoint (.pptx) or PDF straight from your class site"],
]

export function ImportDialog({ notebookId, onClose, onOpen }: { notebookId: string | null; onClose: () => void; onOpen: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [done, setDone] = useState<Done[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [drag, setDrag] = useState(false)
  const files = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)

  const handle = async (list: FileList | null) => {
    if (!list?.length) return
    setErrors([])
    for (const file of [...list]) {
      setBusy(file.name); setPct(0)
      try {
        if (file.type.startsWith("image/")) {
          const { html } = await photoToNote(file, setPct)
          const n = await createNote({ title: file.name.replace(/\.[^.]+$/, "").replace(/^IMG[_-]?\d+$/i, "Photo notes"), content: htmlToDoc(html), notebookId, tags: ["imported"] })
          setDone((d) => [...d, { id: n.id, title: n.title }])
        } else {
          for (const item of await importFile(file)) {
            const n = await createNote({ title: item.title, content: htmlToDoc(item.html), notebookId, tags: ["imported"] })
            setDone((d) => [...d, { id: n.id, title: n.title }])
          }
        }
      } catch (e) {
        setErrors((x) => [...x, `${file.name}: ${(e as Error).message}`])
      }
    }
    setBusy(null)
  }

  return (
    <Modal title="Import notes, slides or a photo" onClose={onClose} wide>
      <div
        className={`dropzone${drag ? " over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files) }}
      >
        <Icon name="fileImport" size={32} />
        <p style={{ margin: 0 }}><strong>Drop files here</strong> or choose them. PDF, PowerPoint, Word, Markdown, HTML, Evernote, Notion/Obsidian zips and photos.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => files.current?.click()} disabled={!!busy}><Icon name="upload" /> Choose files</button>
          <button className="btn" onClick={() => camera.current?.click()} disabled={!!busy}><Icon name="camera" /> Photo of notes</button>
        </div>
        <input ref={files} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { void handle(e.target.files); e.target.value = "" }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void handle(e.target.files); e.target.value = "" }} />
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          Files are read on this device and never uploaded. {hasKey()
            ? "Photos are read by Gemini (your key), which also understands handwriting."
            : "Photos are read on this device (printed text). Add a free Gemini key in Settings to read handwriting."}
        </p>
      </div>

      {busy && (
        <div aria-live="polite">
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Reading {busy}…{pct > 0 && pct < 100 ? ` ${pct}%` : ""}</div>
          <div className="progress"><div style={{ width: `${pct || 35}%` }} /></div>
        </div>
      )}
      {errors.map((e) => <p key={e} className="notice error" role="alert" style={{ margin: 0 }}>{e}</p>)}
      {done.length > 0 && (
        <div>
          <h3 style={{ margin: "4px 0 8px" }}>Imported {done.length} note{done.length === 1 ? "" : "s"}</h3>
          <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 14 }}>Open one and press <strong>Explain simply</strong> or <strong>Detailed study guide</strong> to have it summarized.</p>
          <div className="chips">
            {done.slice(0, 30).map((d) => <button key={d.id} className="chip" onClick={() => { onOpen(d.id); onClose() }}>{d.title}</button>)}
          </div>
        </div>
      )}

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Bringing notes from another app?</summary>
        <dl className="howto">
          {HOW_TO.map(([app, how]) => (
            <div key={app}><dt>{app}</dt><dd>{how}</dd></div>
          ))}
        </dl>
      </details>
    </Modal>
  )
}
