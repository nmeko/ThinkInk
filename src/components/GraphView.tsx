import { useEffect, useMemo, useRef, useState } from "react"
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from "d3-force"
import type { Note, Notebook } from "../lib/db"
import { displayTitle } from "../lib/text"

type GNode = SimulationNodeDatum & { id: string; label: string; color: string; degree: number }
type GLink = { source: string | GNode; target: string | GNode }

/** Obsidian-style map of how notes connect through [[links]]. */
export function GraphView({ notes, notebooks, onOpenNote }: { notes: Note[]; notebooks: Notebook[]; onOpenNote: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [, tick] = useState(0)

  const { nodes, links } = useMemo(() => {
    const live = notes.filter((n) => !n.deletedAt)
    const byTitle = new Map(live.map((n) => [displayTitle(n).toLowerCase(), n.id]))
    const color = (n: Note) => n.color ?? notebooks.find((b) => b.id === n.notebookId)?.color ?? "#2f4ac0"
    const links: GLink[] = []
    for (const n of live) for (const l of n.links) {
      const target = byTitle.get(l.toLowerCase())
      if (target && target !== n.id) links.push({ source: n.id, target })
    }
    const degree = new Map<string, number>()
    links.forEach((l) => { degree.set(l.source as string, (degree.get(l.source as string) ?? 0) + 1); degree.set(l.target as string, (degree.get(l.target as string) ?? 0) + 1) })
    return { nodes: live.map((n) => ({ id: n.id, label: displayTitle(n), color: color(n), degree: degree.get(n.id) ?? 0 })) as GNode[], links }
  }, [notes, notebooks])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const sim = forceSimulation(nodes)
      .force("link", forceLink<GNode, GLink>(links).id((d) => d.id).distance(90))
      .force("charge", forceManyBody().strength(-180))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force("collide", forceCollide(26))
      .on("tick", () => tick((t) => t + 1))
    return () => { sim.stop() }
  }, [nodes, links, size.w, size.h])

  return (
    <div className="view" style={{ display: "flex", flexDirection: "column" }}>
      <div className="view-inner" style={{ paddingBottom: 8, width: "100%" }}>
        <h1>Knowledge graph</h1>
        <p className="lead" style={{ marginBottom: 0 }}>Every dot is a note; lines are [[links]] between them. Bigger dots are more connected. Click one to open it.</p>
      </div>
      <div className="graph" ref={box} style={{ minHeight: 360 }}>
        {nodes.length === 0 ? <div className="empty"><h3>No notes yet</h3></div> : (
          <svg viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label={`Graph of ${nodes.length} notes and ${links.length} links`}>
            {links.map((l, i) => {
              const s = l.source as GNode, t = l.target as GNode
              return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} />
            })}
            {nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x ?? 0},${n.y ?? 0})`}>
                <circle r={7 + Math.min(n.degree, 8) * 2} fill={n.color} onClick={() => onOpenNote(n.id)} tabIndex={0} role="button" aria-label={`Open ${n.label}`}
                  onKeyDown={(e) => e.key === "Enter" && onOpenNote(n.id)} />
                <text x={12 + Math.min(n.degree, 8) * 2} y={4}>{n.label.slice(0, 28)}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
      {links.length === 0 && nodes.length > 0 && <p className="notice" style={{ margin: 16 }}>No links yet. Type <code>[[Another note's title]]</code> inside a note to connect them.</p>}
    </div>
  )
}
