// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { cleanHtml, markdownToHtml } from "./markdown"

describe("cleaning HTML from AI answers and imported files", () => {
  it("removes scripts, handlers and javascript: links", () => {
    const out = cleanHtml(`<p onclick="x()">hi<script>alert(1)</script></p><a href="javascript:alert(1)">bad</a><iframe src="https://x"></iframe>`)
    expect(out).not.toMatch(/script|onclick|javascript|iframe/i)
    expect(out).toContain("<p>hi</p>")
  })
  it("drops remote images (tracking) but keeps embedded ones", () => {
    const out = cleanHtml(`<img src="https://tracker.example/p.gif"><img src="data:image/png;base64,AAAA" alt="ok">`)
    expect(out).not.toContain("tracker")
    expect(out).toContain('alt="ok"')
  })
  it("opens safe links in a new tab without passing the page along", () => {
    expect(cleanHtml(`<a href="https://en.wikipedia.org">w</a>`)).toBe('<a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">w</a>')
  })
  it("turns Markdown into clean HTML", () => {
    expect(markdownToHtml("## Words to know\n- **Cell**: the smallest living unit")).toBe("<h2>Words to know</h2>\n<ul>\n<li><strong>Cell</strong>: the smallest living unit</li>\n</ul>\n")
    expect(markdownToHtml("<img src=x onerror=alert(1)>")).not.toMatch(/onerror|<img/)
  })
})
