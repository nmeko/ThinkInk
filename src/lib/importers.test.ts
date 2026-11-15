// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import JSZip from "jszip"
import { fromDocx, fromEnex, fromPptx, htmlToDoc, importFile } from "./importers"

// jsdom's File lacks these; browsers have them
const read = <T,>(f: Blob, how: "readAsArrayBuffer" | "readAsText") =>
  new Promise<T>((done) => { const r = new FileReader(); r.onload = () => done(r.result as T); r[how](f) })
File.prototype.arrayBuffer ??= function (this: File) { return read<ArrayBuffer>(this, "readAsArrayBuffer") }
File.prototype.text ??= function (this: File) { return read<string>(this, "readAsText") }

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

async function zipOf(files: Record<string, string>) {
  const z = new JSZip()
  for (const [k, v] of Object.entries(files)) z.file(k, v)
  return z.generateAsync({ type: "arraybuffer" })
}

describe("importing other apps' files", () => {
  it("reads PowerPoint slides in order, with speaker notes", async () => {
    const slide = (title: string, bullet: string) => `<p:sld ${A} xmlns:p="p"><a:p><a:r><a:t>${title}</a:t></a:r></a:p><a:p><a:r><a:t>${bullet}</a:t></a:r></a:p></p:sld>`
    const html = await fromPptx(await zipOf({
      "ppt/slides/slide2.xml": slide("Mitosis", "Two identical cells"),
      "ppt/slides/slide10.xml": slide("Summary", "<script>x</script>"),
      "ppt/slides/slide1.xml": slide("Cells", "Smallest unit of life"),
      "ppt/notesSlides/notesSlide1.xml": `<n ${A}><a:t>Mention the microscope demo</a:t></n>`,
    }))
    expect(html.indexOf("Slide 1: Cells")).toBeLessThan(html.indexOf("Slide 2: Mitosis"))
    expect(html.indexOf("Slide 2: Mitosis")).toBeLessThan(html.indexOf("Slide 3: Summary"))
    expect(html).toContain("<li>Smallest unit of life</li>")
    expect(html).toContain("Mention the microscope demo")
    expect(html).not.toContain("<script")
  })

  it("reads Word headings, paragraphs and lists", async () => {
    const p = (text: string, style = "", list = false) =>
      `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${list ? "<w:pPr><w:numPr/></w:pPr>" : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`
    const html = await fromDocx(await zipOf({ "word/document.xml": `<w:document ${W}><w:body>${p("Photosynthesis", "Heading1")}${p("Plants make food.")}${p("Light", "", true)}${p("Water", "", true)}</w:body></w:document>` }))
    expect(html).toBe("<h1>Photosynthesis</h1><p>Plants make food.</p><ul><li>Light</li><li>Water</li></ul>")
  })

  it("reads every note in an Evernote export and cleans its HTML", () => {
    const notes = fromEnex(`<?xml version="1.0"?><en-export><note><title>Lab 1</title><content><![CDATA[<en-note><div>Result <b>ok</b></div><img src="https://evil/pixel.gif"/><a href="javascript:x">x</a></en-note>]]></content></note><note><title>Lab 2</title><content><![CDATA[<en-note>Two</en-note>]]></content></note></en-export>`)
    expect(notes.map((n) => n.title)).toEqual(["Lab 1", "Lab 2"])
    expect(notes[0].html).toContain("<b>ok</b>")
    expect(notes[0].html).not.toMatch(/evil|javascript/)
  })

  it("imports a Notion-style zip of Markdown pages, skipping system files", async () => {
    const data = await zipOf({
      "Export/Biology 3f1c2b9a8e7d6c5b4a3f2e1d0c9b8a7f.md": "---\ntags: bio\n---\n# Cells\n\n- membrane",
      "__MACOSX/._junk.md": "junk",
      "Export/image.png": "x",
    })
    const out = await importFile(new File([data], "notion.zip"))
    expect(out).toEqual([{ title: "Biology", html: "<h1>Cells</h1>\n<ul>\n<li>membrane</li>\n</ul>\n" }])
  })

  it("refuses unknown file types with a helpful message", async () => {
    await expect(importFile(new File(["x"], "notes.key"))).rejects.toThrow(/can't read \.key/)
  })

  it("turns imported HTML into editor content", () => {
    expect(htmlToDoc("<h2>Hi</h2><p>there</p>").content?.map((n) => n.type)).toEqual(["heading", "paragraph"])
  })
})
