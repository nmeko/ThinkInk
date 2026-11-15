import { useState } from "react"
import { learningLinks, searchPapers, searchWikipedia, type Source } from "../lib/sources"
import { Modal } from "./Modal"
import { Icon } from "./Icon"

/** "Learn more": credible reading, research and videos about what this note covers. */
export function SourcesPanel({ initial, onCite, onClose }: { initial: string; onCite: (s: { title: string; url: string }) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<{ wiki: Source[]; papers: Source[]; errors: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [cited, setCited] = useState<Set<string>>(new Set())

  const search = async () => {
    if (!q.trim()) return
    setBusy(true)
    const [wiki, papers] = await Promise.allSettled([searchWikipedia(q), searchPapers(q)])
    setResults({
      wiki: wiki.status === "fulfilled" ? wiki.value : [],
      papers: papers.status === "fulfilled" ? papers.value : [],
      errors: [wiki, papers].flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : [])),
    })
    setBusy(false)
  }
  const cite = (s: { title: string; url: string }) => { onCite(s); setCited((c) => new Set(c).add(s.url)) }

  const list = (items: Source[], empty: string) => items.length ? (
    <ul className="sources">
      {items.map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noopener noreferrer"><strong>{s.title}</strong> <Icon name="external" size={13} /></a>
          {s.snippet && <p>{s.snippet}</p>}
          <small>{s.meta}</small>
          <button className="btn btn-ghost" onClick={() => cite(s)} disabled={cited.has(s.url)}>
            {cited.has(s.url) ? <><Icon name="check" /> Added</> : <><Icon name="plus" /> Add to note's sources</>}
          </button>
        </li>
      ))}
    </ul>
  ) : <p style={{ color: "var(--muted)", margin: 0 }}>{empty}</p>

  return (
    <Modal title="Learn more from trusted sources" onClose={onClose} wide>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <label className="sr-only" htmlFor="src-q">Topic</label>
        <input id="src-q" className="input" style={{ flex: 1, minWidth: 200 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topic, e.g. photosynthesis" />
        <button className="btn btn-primary" disabled={busy || !q.trim()}><Icon name="search" /> Search</button>
      </form>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Searching sends only these words to Wikipedia and OpenAlex (a free index of research). Your notes stay on your device.</p>

      {busy && <p role="status">Searching…</p>}
      {results && (
        <>
          {results.errors.map((e) => <p key={e} className="notice error" style={{ margin: 0 }}>{e}</p>)}
          <h3 className="src-head">Encyclopedia</h3>
          {list(results.wiki, "No encyclopedia articles found.")}
          <h3 className="src-head">Research you can read for free</h3>
          {list(results.papers, "No open-access research found. Try broader words.")}
        </>
      )}

      <h3 className="src-head">Lessons and videos</h3>
      <ul className="learn-links">
        {learningLinks(q || initial).map((l) => (
          <li key={l.name}>
            <a href={l.url} target="_blank" rel="noopener noreferrer"><strong>{l.name}</strong> <Icon name="external" size={13} /></a>
            <span>{l.what}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
