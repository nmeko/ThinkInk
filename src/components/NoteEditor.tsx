import { useEffect, useMemo, useRef, useState } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { useLiveQuery } from "dexie-react-hooks"
import { db, updateNote, trashNote, saveBlob, getBlob, type Note, type Notebook, type Stroke } from "../lib/db"
import { WikiLinks, Timestamps } from "../editor/extensions"
import { InkLayer, type InkTool } from "./InkLayer"
import { Icon } from "./Icon"
import { toast } from "../lib/toast"
import { displayTitle, toMarkdown } from "../lib/text"
import { encodeShare, shareUrl, MAX_LINK_LENGTH } from "../lib/share"
import { extractiveSummary, relatedNotes, transcribe } from "../lib/ai/local"
import * as gemini from "../lib/ai/gemini"
import { markdownToHtml } from "../lib/markdown"
import { CardBuilder } from "./CardBuilder"
import { CreateVisual } from "./CreateVisual"
import { SourcesPanel } from "./SourcesPanel"

export const NOTE_COLORS = ["#e03131", "#f08c00", "#ffd43b", "#2f9e44", "#1c7ed6", "#7048e8", "#c2255c"]
const INK_COLORS = ["#1d2433", "#2f4ac0", "#e03131", "#2f9e44", "#f08c00", "#ffd43b"]

type Props = {
  noteId: string
  notes: Note[]
  notebooks: Notebook[]
  onOpenTitle: (title: string) => void
  onOpenNote: (id: string) => void
  onBack: () => void
}

export function NoteEditor({ noteId, notes, notebooks, onOpenTitle, onOpenNote, onBack }: Props) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  if (note === undefined) return <div className="empty">Loading…</div>
  if (!note) return <div className="empty"><h3>This note no longer exists.</h3></div>
  return <LoadedEditor key={note.id} note={note} notes={notes} notebooks={notebooks} onOpenTitle={onOpenTitle} onOpenNote={onOpenNote} onBack={onBack} />
}

function LoadedEditor({ note, notes, notebooks, onOpenTitle, onOpenNote, onBack }: Omit<Props, "noteId"> & { note: Note }) {
  const titles = useMemo(() => new Set(notes.filter((n) => !n.deletedAt).map((n) => displayTitle(n).toLowerCase())), [notes])
  const titlesRef = useRef(titles)
  titlesRef.current = titles
  const recStart = useRef<number | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [title, setTitle] = useState(note.title)
  const [tagDraft, setTagDraft] = useState("")
  const [inkOn, setInkOn] = useState(false)
  const [tool, setTool] = useState<InkTool>("pen")
  const [inkColor, setInkColor] = useState(INK_COLORS[0])
  const [menu, setMenu] = useState(false)
  const [panel, setPanel] = useState<"visual" | "sources" | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      Highlight,
      // Drag a corner to resize; the toolbar's size buttons do the same from the keyboard.
      Image.configure({ allowBase64: true, resize: { enabled: true, minWidth: 60, minHeight: 40, alwaysPreserveAspectRatio: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing… Type [[ to link a note, or press Record to sync with a lecture." }),
      WikiLinks.configure({ exists: (t) => titlesRef.current.has(t.toLowerCase()), open: onOpenTitle }),
      Timestamps.configure({ elapsed: () => (recStart.current ? (Date.now() - recStart.current) / 1000 : null) }),
    ],
    content: note.content,
    editorProps: {
      handlePaste: (_v, e) => insertImages(e.clipboardData?.files),
      handleDrop: (_v, e) => insertImages((e as DragEvent).dataTransfer?.files),
    },
    onUpdate: ({ editor }) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => updateNote(note.id, { content: editor.getJSON() }), 400)
    },
  })

  // Save pending edits when leaving the note.
  useEffect(() => () => {
    clearTimeout(saveTimer.current)
    if (editor && !editor.isDestroyed) updateNote(note.id, { content: editor.getJSON() })
  }, [editor, note.id])

  // Re-color links when notes are added or renamed.
  useEffect(() => { editor?.view.dispatch(editor.state.tr.setMeta("wikiRefresh", true)) }, [titles, editor])

  function insertImages(files?: FileList | null) {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/"))
    if (!images.length || !editor) return false
    for (const f of images) {
      if (f.size > 3_000_000) { toast("Images up to 3 MB, please."); continue }
      const r = new FileReader()
      r.onload = () => editor.chain().focus().setImage({ src: String(r.result), alt: f.name }).run()
      r.readAsDataURL(f)
    }
    return true
  }

  const saveTitle = (t: string) => { setTitle(t); updateNote(note.id, { title: t }) }
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase()
    if (t && !note.tags.includes(t)) updateNote(note.id, { tags: [...note.tags, t] })
    setTagDraft("")
  }

  const share = async () => {
    const payload = encodeShare({ title: note.title, content: editor?.getJSON() ?? note.content, tags: note.tags, ink: note.ink })
    const url = shareUrl(payload)
    if (url.length > MAX_LINK_LENGTH) return toast("This note is too big for a link (images make links long). Use Export instead.")
    try { await navigator.clipboard.writeText(url); toast("Share link copied. Anyone who opens it can save a copy.") }
    catch { prompt("Copy this link:", url) }
  }
  const exportMd = () => {
    const blob = new Blob([toMarkdown(note.title, editor?.getJSON())], { type: "text/markdown" })
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${(displayTitle(note) || "note").replace(/[^\w-]+/g, "_")}.md` })
    a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <div className="editor-top">
        <button className="icon-btn mobile-only" onClick={onBack} aria-label="Back to notes"><Icon name="back" /></button>
        <button className="icon-btn" aria-pressed={note.pinned} onClick={() => updateNote(note.id, { pinned: !note.pinned })} aria-label={note.pinned ? "Unpin" : "Pin to top"} title={note.pinned ? "Unpin" : "Pin to top"}><Icon name="pin" /></button>
        <button className="icon-btn" aria-pressed={inkOn} onClick={() => setInkOn(!inkOn)} aria-label="Draw on this note" title="Draw (handwriting & sketches)"><Icon name="pen" /></button>
        <Recorder note={note} recStart={recStart} />
        <button className="btn btn-ghost" onClick={() => setPanel("visual")} title="Diagrams, graphs, charts and pictures"><Icon name="shapes" /> <span className="hide-sm">Create</span></button>
        <button className="btn btn-ghost" onClick={() => setPanel("sources")} title="Trusted reading, research and videos"><Icon name="library" /> <span className="hide-sm">Sources</span></button>
        <span className="spacer" />
        <SaveState updatedAt={note.updatedAt} />
        <button className="icon-btn" onClick={share} aria-label="Copy share link" title="Share by link"><Icon name="share" /></button>
        <div style={{ position: "relative" }}>
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="More actions" aria-expanded={menu}><Icon name="more" /></button>
          {menu && (
            <div className="menu" style={{ right: 0, top: 36 }} onClick={() => setMenu(false)}>
              <button onClick={exportMd}><Icon name="download" /> Export as Markdown</button>
              <button onClick={() => window.print()}><Icon name="printer" /> Print / save as PDF</button>
              <button className="btn-danger" onClick={() => { trashNote(note.id); onBack(); toast("Moved to Trash. You can restore it from there.") }}><Icon name="trash" /> Move to Trash</button>
            </div>
          )}
        </div>
      </div>
      {editor && <Toolbar editor={editor} />}
      {panel === "visual" && (
        <CreateVisual
          context={editor?.getText() ?? note.text}
          onClose={() => setPanel(null)}
          onInsert={(src, alt) => { editor?.chain().focus().setImage({ src, alt }).run(); toast("Added to your note. Drag a corner to resize it.") }}
        />
      )}
      {panel === "sources" && (
        <SourcesPanel
          initial={displayTitle(note) === "Untitled" ? "" : displayTitle(note)}
          onClose={() => setPanel(null)}
          onCite={(s) => addSource(editor, s)}
        />
      )}
      {inkOn && (
        <div className="ink-tools" role="toolbar" aria-label="Drawing tools">
          {(["pen", "highlighter", "eraser"] as InkTool[]).map((t) => (
            <button key={t} className="icon-btn" aria-pressed={tool === t} onClick={() => setTool(t)} aria-label={t} title={t}><Icon name={t} /></button>
          ))}
          <span className="sep" style={{ width: 1, height: 20, background: "var(--line)", margin: "0 6px" }} />
          {INK_COLORS.map((c) => <button key={c} className="swatch" style={{ background: c }} aria-pressed={inkColor === c} onClick={() => setInkColor(c)} aria-label={`Color ${c}`} />)}
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => updateNote(note.id, { ink: note.ink.slice(0, -1) })} disabled={!note.ink.length}><Icon name="undo" /> Undo</button>
          <button className="btn" onClick={() => setInkOn(false)}><Icon name="check" /> Done</button>
        </div>
      )}
      <div className="editor-scroll">
        <div className={`page${note.audioId ? " has-audio" : ""}`} onClick={(e) => seekFromLine(e)}>
          <input className="title-input" value={title} onChange={(e) => saveTitle(e.target.value)} placeholder="Untitled" aria-label="Note title" />
          <div className="meta-row">
            <select value={note.notebookId ?? ""} onChange={(e) => updateNote(note.id, { notebookId: e.target.value || null })} aria-label="Notebook">
              <option value="">No notebook</option>
              {notebooks.map((nb) => <option key={nb.id} value={nb.id}>{nb.name}</option>)}
            </select>
            {note.tags.map((t) => (
              <span key={t} className="pill">#{t}<button className="icon-btn" style={{ padding: 0 }} onClick={() => updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })} aria-label={`Remove tag ${t}`}><Icon name="x" size={12} /></button></span>
            ))}
            <input className="tag-input" value={tagDraft} placeholder="+ add tag" aria-label="Add tag"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagDraft) } }}
              onBlur={() => tagDraft && addTag(tagDraft)} />
            <span className="colors" role="group" aria-label="Note color">
              {NOTE_COLORS.map((c) => <button key={c} style={{ background: c }} aria-pressed={note.color === c} aria-label={`Color ${c}`} onClick={() => updateNote(note.id, { color: note.color === c ? null : c })} />)}
            </span>
          </div>
          <EditorContent editor={editor} />
          <InkLayer strokes={note.ink} onChange={(ink: Stroke[]) => updateNote(note.id, { ink })} active={inkOn} tool={tool} color={inkColor} size={2.5} />
          <Under note={note} notes={notes} editor={editor} onOpenNote={onOpenNote} />
        </div>
      </div>
    </>
  )
}

// Tap the ▶ beside a timestamped line to hear that moment.
function seekFromLine(e: React.MouseEvent) {
  const line = (e.target as HTMLElement).closest("[data-ts]") as HTMLElement | null
  if (!line || e.clientX > line.getBoundingClientRect().left) return
  window.dispatchEvent(new CustomEvent("thinkink-seek", { detail: Number(line.dataset.ts) }))
}

function SaveState({ updatedAt }: { updatedAt: number }) {
  return <span style={{ fontSize: 12, color: "var(--muted)" }} title={new Date(updatedAt).toLocaleString()}>Saved</span>
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0)
  useEffect(() => {
    const update = () => force((x) => x + 1)
    editor.on("transaction", update)
    return () => { editor.off("transaction", update) }
  }, [editor])
  const b = (label: string, active: boolean, run: () => void, title: string, content?: React.ReactNode) => (
    <button className="icon-btn" aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run} aria-label={title} title={title}>{content ?? label}</button>
  )
  const c = () => editor.chain().focus()
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {b("H1", editor.isActive("heading", { level: 1 }), () => c().toggleHeading({ level: 1 }).run(), "Heading 1")}
      {b("H2", editor.isActive("heading", { level: 2 }), () => c().toggleHeading({ level: 2 }).run(), "Heading 2")}
      {b("H3", editor.isActive("heading", { level: 3 }), () => c().toggleHeading({ level: 3 }).run(), "Heading 3")}
      <span className="sep" />
      {b("B", editor.isActive("bold"), () => c().toggleBold().run(), "Bold (Ctrl+B)")}
      {b("I", editor.isActive("italic"), () => c().toggleItalic().run(), "Italic (Ctrl+I)", <i>I</i>)}
      {b("U", editor.isActive("underline"), () => c().toggleUnderline().run(), "Underline (Ctrl+U)", <u>U</u>)}
      {b("S", editor.isActive("strike"), () => c().toggleStrike().run(), "Strikethrough", <s>S</s>)}
      {b("Hl", editor.isActive("highlight"), () => c().toggleHighlight().run(), "Highlight", <Icon name="highlighter" size={16} />)}
      <span className="sep" />
      {b("•", editor.isActive("bulletList"), () => c().toggleBulletList().run(), "Bullet list")}
      {b("1.", editor.isActive("orderedList"), () => c().toggleOrderedList().run(), "Numbered list")}
      {b("☑", editor.isActive("taskList"), () => c().toggleTaskList().run(), "Checklist", <Icon name="check" size={16} />)}
      {b("❝", editor.isActive("blockquote"), () => c().toggleBlockquote().run(), "Quote")}
      {b("<>", editor.isActive("codeBlock"), () => c().toggleCodeBlock().run(), "Code block")}
      <span className="sep" />
      {b("link", editor.isActive("link"), () => {
        const prev = editor.getAttributes("link").href
        const url = prompt("Link address (leave empty to remove):", prev ?? "https://")
        if (url === null) return
        if (!url) c().unsetLink().run()
        else if (/^(https?:|mailto:)/i.test(url)) c().extendMarkRange("link").setLink({ href: url }).run()
        else toast("Links must start with https://, http:// or mailto:")
      }, "Web link", <Icon name="link" size={16} />)}
      {b("[[", false, () => c().insertContent("[[]]").setTextSelection(editor.state.selection.from + 2).run(), "Link to another note")}
      {b("img", false, () => {
        const input = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" })
        input.onchange = () => {
          const f = input.files?.[0]
          if (!f) return
          if (f.size > 3_000_000) return toast("Images up to 3 MB, please.")
          const r = new FileReader()
          r.onload = () => c().setImage({ src: String(r.result), alt: f.name }).run()
          r.readAsDataURL(f)
        }
        input.click()
      }, "Insert image", <Icon name="image" size={16} />)}
      {editor.isActive("image") && (
        <span className="img-sizes" role="group" aria-label="Image size">
          {([["S", 0.3], ["M", 0.5], ["L", 0.75], ["Full", 1]] as const).map(([label, frac]) => (
            <button key={label} className="icon-btn" onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const width = Math.round(editor.view.dom.clientWidth * frac)
                const pos = editor.state.selection.from
                c().updateAttributes("image", { width, height: null }).setNodeSelection(pos).run()
                // The resizable image view only redraws on drag, so apply the new size to it directly too.
                const dom = editor.view.nodeDOM(pos) as HTMLElement | null
                const img = dom?.tagName === "IMG" ? dom : dom?.querySelector("img")
                if (img) { img.style.width = `${width}px`; img.style.height = "auto" }
              }}
              aria-label={`Image size ${label === "Full" ? "full width" : label}`} title={`Image size: ${label}`}>{label}</button>
          ))}
        </span>
      )}
    </div>
  )
}

/** Lecture Sync recorder: record, then tap any timestamped line to hear that moment. */
function Recorder({ note, recStart }: { note: Note; recStart: React.MutableRefObject<number | null> }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    let u: string | null = null
    if (note.audioId) getBlob(note.audioId).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u) } })
    else setUrl(null)
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [note.audioId])

  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setElapsed((Date.now() - (recStart.current ?? Date.now())) / 1000), 500)
    return () => clearInterval(t)
  }, [rec, recStart])

  // Seek when a line's ▶ is tapped; highlight the line being heard.
  useEffect(() => {
    const seek = (e: Event) => { if (audio.current) { audio.current.currentTime = (e as CustomEvent).detail; audio.current.play() } }
    window.addEventListener("thinkink-seek", seek)
    return () => window.removeEventListener("thinkink-seek", seek)
  }, [])
  const onTime = () => {
    const t = audio.current?.currentTime ?? 0
    let best: Element | null = null, bestTs = -1
    document.querySelectorAll(".ProseMirror [data-ts]").forEach((el) => {
      const ts = Number((el as HTMLElement).dataset.ts)
      el.classList.remove("playing")
      if (ts <= t && ts > bestTs) { best = el; bestTs = ts }
    })
    ;(best as Element | null)?.classList.add("playing")
  }

  const start = async () => {
    if (note.audioId && !confirm("Replace this note's recording with a new one?")) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const r = new MediaRecorder(stream)
      const chunks: Blob[] = []
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const duration = (Date.now() - (recStart.current ?? Date.now())) / 1000
        recStart.current = null
        const blob = new Blob(chunks, { type: r.mimeType })
        const old = note.audioId
        const id = await saveBlob(blob)
        await updateNote(note.id, { audioId: id, audioDuration: duration, transcript: [] })
        if (old) await db.blobs.delete(old)
        toast("Recording saved. Tap ▶ beside a line to hear that moment.")
      }
      recStart.current = Date.now()
      setElapsed(0)
      r.start(1000)
      setRec(r)
    } catch {
      toast("Microphone access was blocked. Allow it in your browser to record.")
    }
  }
  const stop = () => { rec?.stop(); setRec(null) }

  if (rec) return (
    <span className="row" style={{ gap: 8 }}>
      <span className="rec-dot" aria-hidden="true" />
      <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }} aria-live="off">{fmt(elapsed)}</span>
      <button className="btn" onClick={stop}><Icon name="stop" /> Stop</button>
    </span>
  )
  return (
    <span className="row" style={{ gap: 8, flex: url ? "1 1 260px" : undefined }}>
      <button className="btn btn-ghost" onClick={start} title="Record a lecture; your notes get timestamps"><Icon name="mic" /> {url ? "Re-record" : "Record"}</button>
      {url && <audio ref={audio} src={url} controls onTimeUpdate={onTime} style={{ height: 32, flex: 1, minWidth: 160 }} aria-label="Lecture recording" />}
    </span>
  )
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/** Panels under the note: AI tools, transcript, backlinks and related notes. */
function Under({ note, notes, editor, onOpenNote }: { note: Note; notes: Note[]; editor: Editor | null; onOpenNote: (id: string) => void }) {
  const [summary, setSummary] = useState<{ style: gemini.SummaryStyle; html?: string; bullets?: string[] } | null>(null)
  const [building, setBuilding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [related, setRelated] = useState<Note[] | null>(null)
  const myTitle = displayTitle(note).toLowerCase()
  const backlinks = notes.filter((n) => !n.deletedAt && n.id !== note.id && n.links.some((l) => l.toLowerCase() === myTitle))
  const cardCount = useLiveQuery(() => db.cards.where("noteId").equals(note.id).count(), [note.id]) ?? 0

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setPct(0)
    try { await fn() } catch (e) { toast((e as Error).message) } finally { setBusy(null) }
  }
  const text = () => (editor ? editor.getText({ blockSeparator: "\n" }) : note.text)

  const summarize = (style: gemini.SummaryStyle) => run(style === "simple" ? "Writing a simple explanation…" : "Writing a detailed study guide…", async () => {
    setSummary(gemini.hasKey()
      ? { style, html: markdownToHtml(await gemini.summarize(note.title, text(), style)) }
      : { style, bullets: extractiveSummary(text(), style === "simple" ? 5 : 10) })
  })
  const doTranscribe = () => run("Transcribing on your device…", async () => {
    const blob = note.audioId ? await getBlob(note.audioId) : null
    if (!blob) return
    const lines = await transcribe(blob, setPct)
    await updateNote(note.id, { transcript: lines })
    toast("Transcript ready, and now searchable.")
  })
  const findRelated = () => run("Finding related notes…", async () => {
    const r = await relatedNotes(note.id)
    setRelated(r.map((x) => notes.find((n) => n.id === x.noteId)).filter(Boolean) as Note[])
  })

  return (
    <div className="under no-print">
      <div className="row">
        <button className="btn" onClick={() => summarize("simple")} disabled={!!busy} title="Plain words, no background needed"><Icon name="sparkles" /> Explain simply</button>
        <button className="btn btn-ghost" onClick={() => summarize("detailed")} disabled={!!busy} title="Full study guide with key terms and self-check questions"><Icon name="book" /> Detailed study guide</button>
        <button className="btn" onClick={() => setBuilding(true)} disabled={!!busy}><Icon name="study" /> Make flashcards{cardCount ? ` (${cardCount})` : ""}</button>
        {note.audioId && <button className="btn" onClick={doTranscribe} disabled={!!busy}><Icon name="mic" /> {note.transcript.length ? "Re-transcribe" : "Transcribe recording"}</button>}
        <button className="btn btn-ghost" onClick={findRelated} disabled={!!busy}><Icon name="graph" /> Related notes</button>
      </div>
      {busy && (
        <div aria-live="polite">
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{busy}{pct > 0 && pct < 100 ? ` Downloading model ${pct}% (first time only)` : ""}</div>
          <div className="progress"><div style={{ width: `${pct > 0 ? pct : 30}%` }} /></div>
        </div>
      )}
      {summary && (
        <div className="ai-box">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{summary.style === "simple" ? "In plain words" : "Detailed study guide"}</strong>
            <button className="icon-btn" onClick={() => setSummary(null)} aria-label="Close summary"><Icon name="x" /></button>
          </div>
          {summary.html
            ? <div className="md" dangerouslySetInnerHTML={{ __html: summary.html }} />
            : <ul>{summary.bullets?.map((s, i) => <li key={i}>{s}</li>)}</ul>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-ghost" onClick={() => summarize(summary.style === "simple" ? "detailed" : "simple")} disabled={!!busy}>
              {summary.style === "simple" ? "Want more detail?" : "Make it simpler"}
            </button>
            <button className="btn btn-ghost" onClick={() => {
              const html = summary.html ?? `<ul>${(summary.bullets ?? []).map((b) => `<li>${b.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</li>`).join("")}</ul>`
              editor?.chain().focus("end").insertContent(`<h2>${summary.style === "simple" ? "In plain words" : "Study guide"}</h2>${html}`).run()
              toast("Added to the end of this note.")
            }}><Icon name="plus" /> Add to note</button>
          </div>
          {!gemini.hasKey() && <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>These are the key sentences, picked on your device. For explanations written in plain words, add a free Gemini key in Settings.</p>}
        </div>
      )}
      {building && <CardBuilder noteId={note.id} text={text()} headings={headingSections(editor)} onClose={() => setBuilding(false)} />}
      {note.transcript.length > 0 && (
        <div>
          <h4>Transcript</h4>
          <div className="transcript">
            {note.transcript.map((l, i) => (
              <button key={i} onClick={() => window.dispatchEvent(new CustomEvent("thinkink-seek", { detail: l.start }))}>
                <time>{fmt(l.start)}</time><span>{l.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <h4>Linked from</h4>
        {backlinks.length
          ? <div className="chips">{backlinks.map((n) => <button key={n.id} className="chip" onClick={() => onOpenNote(n.id)}>{displayTitle(n)}</button>)}</div>
          : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>No notes link here yet. Write <code>[[{displayTitle(note)}]]</code> in another note to connect them.</p>}
      </div>
      {related && (
        <div>
          <h4>Related by meaning</h4>
          {related.length
            ? <div className="chips">{related.map((n) => <button key={n.id} className="chip" onClick={() => onOpenNote(n.id)}>{displayTitle(n)}</button>)}</div>
            : <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>Nothing closely related yet.</p>}
        </div>
      )}
    </div>
  )
}

/** Adds a link under a "Sources" heading at the end of the note (creating the heading once). */
function addSource(editor: Editor | null, s: { title: string; url: string }) {
  if (!editor) return
  let hasHeading = false
  editor.state.doc.forEach((n) => { if (n.type.name === "heading" && n.textContent.trim().toLowerCase() === "sources") hasHeading = true })
  const link = { type: "text", text: s.title, marks: [{ type: "link", attrs: { href: s.url } }] }
  const content = [
    ...(hasHeading ? [] : [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Sources" }] }]),
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [link] }] }] },
  ]
  editor.chain().insertContentAt(editor.state.doc.content.size, content).run()
  toast("Added to the Sources list at the end of this note.")
}

// Each heading with the text under it, for heading-based flashcards.
function headingSections(editor: Editor | null) {
  const out: { heading: string; body: string }[] = []
  editor?.state.doc.forEach((node) => {
    if (node.type.name === "heading") out.push({ heading: node.textContent, body: "" })
    else if (out.length) out[out.length - 1].body += node.textContent + "\n"
  })
  return out
}
