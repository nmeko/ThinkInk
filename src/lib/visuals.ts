// Graphs, charts and diagrams for notes. Everything ends up as a PNG image in the note,
// so no SVG or script from an AI answer (or a typed formula) ever runs on the page.

type Fn = (x: number) => number
const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/**
 * Parses a formula in x (2x^2 - 3x + 1, sin(x)/x, sqrt(abs(x))) into a function.
 * A small hand-written parser: the text is never evaluated as JavaScript.
 */
export function parseFormula(src: string): Fn {
  const s = src.replace(/^\s*(y|f\(x\))\s*=\s*/i, "").replace(/\s+/g, "").replace(/\*\*/g, "^").replace(/[×·]/g, "*").replace(/[−–]/g, "-").toLowerCase()
  if (!s || s.length > 200) throw new Error("Type a formula in x, like 2x^2 - 3.")
  let i = 0
  const peek = () => s[i]
  const fail = (): never => { throw new Error(`I couldn't read "${src}" near "${s.slice(i, i + 6) || "the end"}".`) }

  // expr := term (('+'|'-') term)*
  function expr(): Fn {
    let left = term()
    while (peek() === "+" || peek() === "-") {
      const op = s[i++], a = left, b = term()
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x)
    }
    return left
  }
  // term := unary (('*'|'/'|implicit) unary)*
  function term(): Fn {
    let left = unary()
    for (;;) {
      const c = peek()
      if (c === "*" || c === "/") {
        i++
        const a = left, b = unary()
        left = c === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x)
      } else if (c !== undefined && /[0-9a-z(.]/.test(c)) {
        const a = left, b = unary() // 2x, 3(x+1), x sin(x)
        left = (x) => a(x) * b(x)
      } else return left
    }
  }
  function unary(): Fn {
    if (peek() === "-") { i++; const a = unary(); return (x) => -a(x) }
    if (peek() === "+") { i++; return unary() }
    return power()
  }
  // power := atom ('^' unary)?   (right-associative: 2^3^2 = 2^9)
  function power(): Fn {
    const base = atom()
    if (peek() !== "^") return base
    i++
    const exp = unary()
    return (x) => Math.pow(base(x), exp(x))
  }
  function atom(): Fn {
    const c = peek()
    if (c === "(") { i++; const e = expr(); if (s[i++] !== ")") fail(); return e }
    const num = s.slice(i).match(/^(\d+\.?\d*|\.\d+)/)
    if (num) { i += num[0].length; const v = Number(num[0]); return () => v }
    const word = s.slice(i).match(/^[a-z]+/)
    if (!word) return fail()
    const w = word[0]
    for (const name of Object.keys(FUNCS).sort((a, b) => b.length - a.length)) {
      if (w.startsWith(name) && s[i + name.length] === "(") {
        i += name.length + 1
        const arg = expr()
        if (s[i++] !== ")") fail()
        const f = FUNCS[name]
        return (x) => f(arg(x))
      }
    }
    for (const name of ["pi", "e", "x"]) if (w.startsWith(name)) {
      i += name.length
      if (name === "x") return (x) => x
      const v = CONSTS[name]
      return () => v
    }
    return fail()
  }
  const f = expr()
  if (i < s.length) fail()
  return f
}

const PALETTE = ["#2f4ac0", "#e03131", "#2f9e44", "#f08c00", "#7048e8"]
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const nice = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : String(Math.round(v * 100) / 100))

/** Plots one or more formulas on shared axes; returns SVG markup. */
export function plotSvg(formulas: string[], xMin: number, xMax: number): string {
  if (!(xMax > xMin)) throw new Error("The x range needs a smaller start than end.")
  const W = 640, H = 420, pad = 44
  const fns = formulas.map(parseFormula)
  const N = 600
  const series = fns.map((f) => Array.from({ length: N + 1 }, (_, k) => { const x = xMin + ((xMax - xMin) * k) / N; return [x, f(x)] as const }))
  const ys = series.flat().map(([, y]) => y).filter((y) => Number.isFinite(y))
  if (!ys.length) throw new Error("The formula has no values in that range.")
  // Ignore extreme spikes (like tan near π/2) when choosing the y range.
  const sorted = [...ys].sort((a, b) => a - b)
  let yMin = sorted[Math.floor(sorted.length * 0.02)], yMax = sorted[Math.ceil(sorted.length * 0.98) - 1]
  if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const m = (yMax - yMin) * 0.08; yMin -= m; yMax += m
  const X = (x: number) => pad + ((x - xMin) / (xMax - xMin)) * (W - 2 * pad)
  const Y = (y: number) => H - pad - ((y - yMin) / (yMax - yMin)) * (H - 2 * pad)
  const grid: string[] = []
  for (let k = 0; k <= 8; k++) {
    const x = xMin + ((xMax - xMin) * k) / 8, y = yMin + ((yMax - yMin) * k) / 8
    grid.push(`<line x1="${X(x)}" y1="${pad}" x2="${X(x)}" y2="${H - pad}" stroke="#e6e8ef"/><text x="${X(x)}" y="${H - pad + 16}" font-size="11" text-anchor="middle" fill="#5b6275">${nice(x)}</text>`)
    grid.push(`<line x1="${pad}" y1="${Y(y)}" x2="${W - pad}" y2="${Y(y)}" stroke="#e6e8ef"/><text x="${pad - 6}" y="${Y(y) + 4}" font-size="11" text-anchor="end" fill="#5b6275">${nice(y)}</text>`)
  }
  const axes = [
    xMin < 0 && xMax > 0 ? `<line x1="${X(0)}" y1="${pad}" x2="${X(0)}" y2="${H - pad}" stroke="#1d2433" stroke-width="1.5"/>` : "",
    yMin < 0 && yMax > 0 ? `<line x1="${pad}" y1="${Y(0)}" x2="${W - pad}" y2="${Y(0)}" stroke="#1d2433" stroke-width="1.5"/>` : "",
  ].join("")
  const paths = series.map((pts, n) => {
    let d = "", pen = false
    for (const [x, y] of pts) {
      const ok = Number.isFinite(y) && y >= yMin - (yMax - yMin) && y <= yMax + (yMax - yMin)
      if (ok) { d += `${pen ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`; pen = true } else pen = false
    }
    return `<path d="${d}" fill="none" stroke="${PALETTE[n % PALETTE.length]}" stroke-width="2.5"/>`
  }).join("")
  const legend = formulas.map((f, n) => `<text x="${pad + 8}" y="${pad + 16 + n * 18}" font-size="13" font-weight="600" fill="${PALETTE[n % PALETTE.length]}">y = ${esc(f.replace(/^\s*(y|f\(x\))\s*=\s*/i, ""))}</text>`).join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/><clipPath id="c"><rect x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}"/></clipPath>${grid.join("")}${axes}<g clip-path="url(#c)">${paths}</g>${legend}</svg>`
}

/** "Label: value" or "Label, value" lines → a bar chart (SVG markup). */
export function barChartSvg(text: string, title = ""): string {
  const rows = text.split("\n").map((l) => l.match(/^\s*(.+?)\s*[:,=\t]\s*(-?[\d.]+)\s*$/)).filter(Boolean).map((m) => ({ label: m![1].slice(0, 30), value: Number(m![2]) }))
  if (!rows.length) throw new Error('Write one bar per line, like "Apples: 12".')
  const W = 640, H = 420, pad = 50, top = title ? 56 : 30
  const max = Math.max(...rows.map((r) => r.value), 0), min = Math.min(...rows.map((r) => r.value), 0)
  const Y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad - top)
  const bw = (W - 2 * pad) / rows.length
  const bars = rows.map((r, k) => {
    const x = pad + k * bw + bw * 0.15, y0 = Y(0), y1 = Y(r.value)
    return `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw * 0.7}" height="${Math.abs(y1 - y0)}" rx="6" fill="${PALETTE[k % PALETTE.length]}"/>` +
      `<text x="${x + bw * 0.35}" y="${Math.min(y0, y1) - 6}" font-size="13" font-weight="600" text-anchor="middle" fill="#1d2433">${nice(r.value)}</text>` +
      `<text x="${x + bw * 0.35}" y="${H - pad + 18}" font-size="12" text-anchor="middle" fill="#5b6275">${esc(r.label)}</text>`
  }).join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="#fff"/>${title ? `<text x="${W / 2}" y="32" font-size="18" font-weight="700" text-anchor="middle" fill="#1d2433">${esc(title)}</text>` : ""}<line x1="${pad}" y1="${Y(0)}" x2="${W - pad}" y2="${Y(0)}" stroke="#1d2433"/>${bars}</svg>`
}

/** Draws SVG markup onto a canvas and returns a PNG data URL (at 2x for sharp screens). */
export async function svgToPng(svg: string, scale = 2): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const w = img.naturalWidth || 640, h = img.naturalHeight || 420
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.min(w * scale, 4000), height: Math.min(h * scale, 4000) })
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Renders Mermaid diagram text to SVG with Mermaid's strict mode (no clicks, links or HTML labels). */
export async function mermaidSvg(code: string): Promise<string> {
  const { default: mermaid } = await import("mermaid")
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default", htmlLabels: false, flowchart: { htmlLabels: false } })
  await mermaid.parse(code)
  const { svg } = await mermaid.render(`dg${Math.random().toString(36).slice(2)}`, code)
  return svg
}

export const DIAGRAM_TEMPLATES: Record<string, string> = {
  Flowchart: "flowchart TD\n  A[Question] --> B{Is it true?}\n  B -- Yes --> C[Result 1]\n  B -- No --> D[Result 2]",
  Cycle: "flowchart LR\n  A[Evaporation] --> B[Condensation]\n  B --> C[Precipitation]\n  C --> D[Collection]\n  D --> A",
  "Mind map": "mindmap\n  root((Topic))\n    Idea 1\n      Detail\n    Idea 2\n    Idea 3",
  Timeline: "timeline\n  title Key events\n  1776 : Declaration of Independence\n  1787 : Constitution written\n  1791 : Bill of Rights",
  Sequence: "sequenceDiagram\n  Student->>Teacher: Asks a question\n  Teacher-->>Student: Explains\n  Student->>Student: Practices",
  "Pie chart": 'pie title Time spent studying\n  "Reading" : 40\n  "Flashcards" : 35\n  "Practice tests" : 25',
}
