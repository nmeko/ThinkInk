import { generateHTML } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Highlight from "@tiptap/extension-highlight"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import type { SharedNote } from "../lib/share"
import { Icon } from "./Icon"

/** Preview of a note someone shared by link; saving makes a private copy. */
export function ShareImport({ shared, onSave, onDismiss }: { shared: SharedNote | "invalid"; onSave: () => void; onDismiss: () => void }) {
  let html = ""
  if (shared !== "invalid") {
    // generateHTML only renders known node types, so a crafted link can't inject markup.
    try { html = generateHTML(shared.content, [StarterKit, Image, Highlight, TaskList, TaskItem]) } catch { html = "" }
  }
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onDismiss()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Shared note">
        <div className="dialog-body">
          {shared === "invalid" || !html ? (
            <>
              <h2 style={{ margin: 0 }}>This share link doesn't work</h2>
              <p className="lead" style={{ margin: 0 }}>It may have been cut off when it was copied. Ask the sender to share it again.</p>
              <div className="row"><button className="btn btn-primary" onClick={onDismiss}>OK</button></div>
            </>
          ) : (
            <>
              <span className="pill" style={{ justifySelf: "start" }}><Icon name="share" size={12} /> Shared with you</span>
              <h2 style={{ margin: 0 }}>{shared.title || "Untitled"}</h2>
              <div className="ProseMirror" style={{ minHeight: 0, maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12, padding: 14 }} dangerouslySetInnerHTML={{ __html: html }} />
              <div className="row">
                <button className="btn btn-primary" onClick={onSave}><Icon name="download" /> Save a copy to my notes</button>
                <button className="btn btn-ghost" onClick={onDismiss}>Not now</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
