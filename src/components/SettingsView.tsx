import { useState } from "react"
import { importAll } from "../lib/db"
import { downloadBackup } from "../lib/backup"
import * as gemini from "../lib/ai/gemini"
import { toast } from "../lib/toast"
import { Icon } from "./Icon"

const HIGHLIGHTERS = [["sun", "Yellow", "#ffe45c"], ["mint", "Mint", "#7ef0c0"], ["pink", "Pink", "#ff9ecb"], ["sky", "Sky blue", "#8fd3ff"], ["lilac", "Lilac", "#c9b5ff"]]

export function SettingsView() {
  const [key, setKey] = useState(gemini.getKey())
  const [status, setStatus] = useState<string | null>(null)
  const [hl, setHl] = useState(document.documentElement.dataset.hl ?? "sun")
  const pickHl = (id: string) => {
    setHl(id); document.documentElement.dataset.hl = id
    try { localStorage.setItem("thinkink-hl", id) } catch { /* storage blocked */ }
  }

  const saveKey = async () => {
    gemini.setKey(key)
    if (!key) { setStatus("Key removed. ThinkInk uses on-device AI only."); return }
    setStatus("Checking key…")
    try { setStatus((await gemini.testKey()) ? "✅ Key works. Smarter summaries, flashcards, quizzes and answers are on." : "Key saved, but the test reply was unexpected.") }
    catch (e) { setStatus(`⚠️ ${(e as Error).message}`) }
  }

  const backup = () => downloadBackup()
  const restore = () => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: "application/json,.json" })
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try { toast(`Restored ${await importAll(JSON.parse(await f.text()))} notes.`) }
      catch (e) { toast((e as Error).message || "That file couldn't be read.") }
    }
    input.click()
  }

  return (
    <div className="view"><div className="view-inner" style={{ display: "grid", gap: 18 }}>
      <div><h1>Settings & backup</h1><p className="lead">Your notes live privately in this browser. Nothing leaves this device unless you use one of the features listed under Privacy.</p></div>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Highlighter color</h2>
        <p style={{ margin: 0 }}>Used for highlights, the selected item, and Inky's cheeks.</p>
        <div className="hl-picker" role="group" aria-label="Highlighter color">
          {HIGHLIGHTERS.map(([id, name, color]) => (
            <button key={id} aria-pressed={hl === id} aria-label={name} title={name} style={{ background: color }} onClick={() => pickHl(id)} />
          ))}
        </div>
      </section>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>AI</h2>
        <p style={{ margin: 0 }}><strong>Built in, free and private:</strong> search by meaning, related notes, lecture transcripts, key-sentence summaries, flashcards and quizzes. The models download once (about 60 MB) and then run on your device.</p>
        <p style={{ margin: 0 }}><strong>Optional, smarter:</strong> paste a free Google Gemini API key for written summaries, AI-written flashcards and quizzes, and answers with sources. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Get a free key</a>.</p>
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 220 }} type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Gemini API key (optional)" aria-label="Gemini API key" autoComplete="off" />
          <button className="btn btn-primary" onClick={saveKey}>Save</button>
          {gemini.hasKey() && <button className="btn btn-ghost" onClick={() => { setKey(""); gemini.setKey(""); setStatus("Key removed.") }}>Remove</button>}
        </div>
        {status && <p style={{ margin: 0 }} aria-live="polite">{status}</p>}
        <p className="notice" style={{ margin: 0 }}>The key is stored only in this browser and sent only to Google. When you use it, the text of the notes involved is sent to Google's Gemini API.</p>
      </section>

      <section className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Backup & move devices</h2>
        <p style={{ margin: 0 }}>Download everything (notes, drawings, recordings, flashcards) as one file, then restore it on another device or browser.</p>
        <div className="row">
          <button className="btn" onClick={backup}><Icon name="download" /> Download backup</button>
          <button className="btn" onClick={restore}><Icon name="upload" /> Restore from backup</button>
        </div>
        <p className="notice" style={{ margin: 0 }}>Clearing your browser's site data deletes notes stored here, so download a backup now and then.</p>
      </section>


      <section className="card" style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Privacy</h2>
        <p style={{ margin: 0 }}>ThinkInk has no accounts, ads or tracking. Your notes, drawings, recordings and flashcards are stored only in this browser. Data leaves your device only in these cases, and only when you use the feature:</p>
        <ul style={{ margin: 0, paddingLeft: "1.2em", display: "grid", gap: 4 }}>
          <li><strong>Gemini key (optional):</strong> the text (or photo) you ask about is sent to Google's Gemini API.</li>
          <li><strong>Study hubs (optional):</strong> what you post is encrypted on your device first; the hub server (Supabase) stores only scrambled data plus an anonymous member id. Only people with the invite link can read it.</li>
          <li><strong>Share links:</strong> the note travels inside the link itself; no server stores it.</li>
          <li><strong>Sources:</strong> only your search words go to Wikipedia and OpenAlex.</li>
          <li><strong>On-device AI and photo reading:</strong> the AI models and reading files download once from Hugging Face and jsDelivr; your notes are processed on this device and never sent.</li>
        </ul>
      </section>
      <section className="card" style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Keyboard shortcuts</h2>
        {[["Ctrl/⌘ K", "Search & jump anywhere"], ["Ctrl/⌘ Alt N", "New note"], ["[[ ]]", "Link to another note"], ["Ctrl/⌘ B · I · U", "Bold · italic · underline"], ["Space, 1–4", "Flip and grade flashcards"]].map(([k, d]) => (
          <div key={k} className="row" style={{ justifyContent: "space-between" }}><span>{d}</span><kbd>{k}</kbd></div>
        ))}
      </section>
    </div></div>
  )
}
