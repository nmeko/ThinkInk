import { useEffect, useState } from "react"
import DOMPurify from "dompurify"
import { barChartSvg, DIAGRAM_TEMPLATES, mermaidSvg, plotSvg, svgToPng } from "../lib/visuals"
import * as gemini from "../lib/ai/gemini"
import { Modal } from "./Modal"
import { Icon } from "./Icon"

type Tab = "describe" | "diagram" | "graph" | "chart"
const TABS: [Tab, string][] = [["describe", "Describe it"], ["diagram", "Diagram"], ["graph", "Graph a function"], ["chart", "Bar chart"]]

/** Makes a picture and hands back a PNG data URL to insert; the preview is that same PNG. */
export function CreateVisual({ context, onInsert, onClose }: { context: string; onInsert: (png: string, alt: string) => void; onClose: () => void }) {
  const ai = gemini.hasKey()
  const [tab, setTab] = useState<Tab>(ai ? "describe" : "diagram")
  const [describe, setDescribe] = useState("")
  const [diagram, setDiagram] = useState(DIAGRAM_TEMPLATES.Flowchart)
  const [formulas, setFormulas] = useState("x^2 - 3\nsin(x)")
  const [range, setRange] = useState({ from: -5, to: 5 })
  const [chart, setChart] = useState("Monday: 2\nTuesday: 3.5\nWednesday: 1\nThursday: 4")
  const [chartTitle, setChartTitle] = useState("Hours studied")
  const [png, setPng] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const render = async (make: () => Promise<string>) => {
    setBusy(true); setError("")
    try { setPng(await svgToPng(await make())) } catch (e) { setPng(null); setError((e as Error).message || "That couldn't be drawn.") } finally { setBusy(false) }
  }

  // Hand-made visuals preview as you type.
  useEffect(() => {
    if (tab === "describe") return
    const t = setTimeout(() => void render(async () =>
      tab === "diagram" ? mermaidSvg(diagram)
        : tab === "graph" ? plotSvg(formulas.split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 5), range.from, range.to)
          : barChartSvg(chart, chartTitle)), 400)
    return () => clearTimeout(t)
  }, [tab, diagram, formulas, range, chart, chartTitle])

  const fromDescription = () => render(async () => {
    const v = await gemini.makeVisual(describe, context)
    if (v.kind === "mermaid") { setDiagram(v.code); return mermaidSvg(v.code) }
    // AI-written SVG: strip anything active before drawing it as an image.
    const clean = DOMPurify.sanitize(v.code, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "image", "use", "a"] })
    if (!clean.includes("<svg")) throw new Error("Gemini didn't return a usable picture. Try describing it differently.")
    return clean.includes("xmlns=") ? clean : clean.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
  })

  const alt = tab === "describe" ? describe : tab === "graph" ? `Graph of ${formulas.split("\n").join(", ")}` : tab === "chart" ? chartTitle || "Bar chart" : "Diagram"

  return (
    <Modal title="Create a diagram, graph or picture" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className="chip" onClick={() => { setTab(id); setPng(null); setError("") }}>{label}</button>
        ))}
      </div>

      {tab === "describe" && (ai ? (
        <>
          <label className="field">What should it show?
            <textarea className="input" rows={3} value={describe} onChange={(e) => setDescribe(e.target.value)} placeholder="e.g. A labeled diagram of a plant cell · A flowchart of how a bill becomes law · A timeline of World War II" />
          </label>
          <div className="row"><button className="btn btn-primary" onClick={fromDescription} disabled={busy || !describe.trim()}><Icon name="sparkles" /> Create</button></div>
        </>
      ) : (
        <p className="notice" style={{ margin: 0 }}>Add a free Gemini key in Settings to create pictures from a description. Meanwhile, the Diagram, Graph and Bar chart tabs work without one.</p>
      ))}

      {tab === "diagram" && (
        <>
          <div className="chips">{Object.keys(DIAGRAM_TEMPLATES).map((k) => <button key={k} className="chip" onClick={() => setDiagram(DIAGRAM_TEMPLATES[k])}>{k}</button>)}</div>
          <label className="field">Edit the diagram (each line is a box, arrow or label)
            <textarea className="input mono" rows={7} value={diagram} onChange={(e) => setDiagram(e.target.value)} spellCheck={false} />
          </label>
        </>
      )}

      {tab === "graph" && (
        <>
          <label className="field">Formulas in x, one per line (up to 5)
            <textarea className="input mono" rows={3} value={formulas} onChange={(e) => setFormulas(e.target.value)} spellCheck={false} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>x from<input className="input" type="number" value={range.from} onChange={(e) => setRange({ ...range, from: Number(e.target.value) })} /></label>
            <label className="field" style={{ flex: 1 }}>x to<input className="input" type="number" value={range.to} onChange={(e) => setRange({ ...range, to: Number(e.target.value) })} /></label>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Use + − * / ^ and sin, cos, tan, sqrt, abs, ln, log, exp, pi, e. Example: 2x^2 - 3x + 1</p>
        </>
      )}

      {tab === "chart" && (
        <>
          <label className="field">Title<input className="input" value={chartTitle} onChange={(e) => setChartTitle(e.target.value)} /></label>
          <label className="field">One bar per line: label, then a number
            <textarea className="input mono" rows={5} value={chart} onChange={(e) => setChart(e.target.value)} spellCheck={false} />
          </label>
        </>
      )}

      <div className="visual-preview" aria-live="polite">
        {busy ? <p role="status">Drawing…</p> : error ? <p className="notice error" role="alert" style={{ margin: 0 }}>{error}</p> : png ? <img src={png} alt={`Preview: ${alt}`} /> : <p style={{ color: "var(--muted)" }}>The preview appears here.</p>}
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!png || busy} onClick={() => { onInsert(png!, alt); onClose() }}><Icon name="check" /> Insert into note</button>
      </div>
    </Modal>
  )
}
