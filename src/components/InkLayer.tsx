import { useEffect, useRef } from "react"
import type { Stroke } from "../lib/db"

export type InkTool = "pen" | "highlighter" | "eraser"

type Props = {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
  active: boolean
  tool: InkTool
  color: string
  size: number
}

/** Transparent drawing layer over the note; stroke points are in page pixels, so ink stays put as text reflows less. */
export function InkLayer({ strokes, onChange, active, tool, color, size }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<Stroke | null>(null)
  const latest = useRef(strokes)
  latest.current = strokes

  const redraw = () => {
    const c = canvas.current
    if (!c) return
    const parent = c.parentElement!
    const ratio = window.devicePixelRatio || 1
    const w = parent.clientWidth, h = parent.scrollHeight
    if (c.width !== Math.round(w * ratio) || c.height !== Math.round(h * ratio)) {
      c.width = Math.round(w * ratio); c.height = Math.round(h * ratio)
      c.style.width = `${w}px`; c.style.height = `${h}px`
    }
    const ctx = c.getContext("2d")!
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, w, h)
    for (const s of [...latest.current, ...(drawing.current ? [drawing.current] : [])]) paint(ctx, s)
  }

  useEffect(redraw)
  useEffect(() => {
    const parent = canvas.current?.parentElement
    if (!parent) return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(parent)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const point = (e: React.PointerEvent): [number, number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5]
  }

  const eraseAt = (x: number, y: number) => {
    const hit = latest.current.filter((s) => !s.points.some(([px, py]) => Math.hypot(px - x, py - y) < 10 + s.size))
    if (hit.length !== latest.current.length) onChange(hit)
  }

  return (
    <canvas
      ref={canvas}
      className={`ink-layer${active ? " active" : ""}`}
      aria-label={active ? "Drawing area" : undefined}
      aria-hidden={!active}
      onPointerDown={(e) => {
        if (!active) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = point(e)
        if (tool === "eraser") return eraseAt(p[0], p[1])
        drawing.current = { tool, color, size: tool === "highlighter" ? size * 4 : size, points: [p] }
      }}
      onPointerMove={(e) => {
        if (!active || !(e.buttons & 1)) return
        const p = point(e)
        if (tool === "eraser") return eraseAt(p[0], p[1])
        if (drawing.current) { drawing.current.points.push(p); redraw() }
      }}
      onPointerUp={() => {
        if (drawing.current && drawing.current.points.length > 1) onChange([...latest.current, drawing.current])
        drawing.current = null
        redraw()
      }}
    />
  )
}

function paint(ctx: CanvasRenderingContext2D, s: Stroke) {
  if (s.points.length < 2) return
  ctx.save()
  ctx.lineCap = "round"; ctx.lineJoin = "round"
  ctx.strokeStyle = s.color
  if (s.tool === "highlighter") {
    // One continuous path, so overlapping segments don't darken the highlight.
    ctx.globalAlpha = 0.3
    ctx.lineWidth = s.size
    ctx.beginPath()
    ctx.moveTo(s.points[0][0], s.points[0][1])
    for (const [x, y] of s.points.slice(1)) ctx.lineTo(x, y)
    ctx.stroke()
    ctx.restore()
    return
  }
  // Pen: width follows pressure.
  for (let i = 1; i < s.points.length; i++) {
    const [x0, y0, p0] = s.points[i - 1], [x1, y1, p1] = s.points[i]
    ctx.lineWidth = s.size * (0.5 + (p0 + p1) / 2)
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  }
  ctx.restore()
}
