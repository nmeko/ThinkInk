import { generateJSON, type JSONContent } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Highlight from "@tiptap/extension-highlight"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { cleanHtml, markdownToHtml } from "./markdown"

// Turns files exported from other apps into ThinkInk notes, entirely in the browser.
// Nothing is uploaded. Every result goes through cleanHtml, and sizes are capped so a
// hostile file (a "zip bomb", a giant PDF) can't freeze the tab.

export type Imported = { title: string; html: string }

const MAX_FILE = 60e6
const MAX_ENTRY = 8e6
const MAX_NOTES = 500

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const baseName = (name: string) => name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s[0-9a-f]{32}$/i, "").trim() || "Imported note"
const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")

export const ACCEPT = ".pdf,.pptx,.docx,.md,.markdown,.txt,.html,.htm,.enex,.zip,image/*"

/** The same node types the editor understands, so imported notes open exactly as they'll be edited. */
export function htmlToDoc(html: string): JSONContent {
  return generateJSON(cleanHtml(html) || "<p></p>", [StarterKit, Image, Highlight, TaskList, TaskItem])
}

export async function importFile(file: File): Promise<Imported[]> {
  if (file.size > MAX_FILE) throw new Error(`${file.name} is over 60 MB.`)
  const ext = file.name.toLowerCase().split(".").pop() ?? ""
  const title = baseName(file.name)
  switch (ext) {
    case "md": case "markdown": return [{ title, html: markdownToHtml(stripFrontMatter(await file.text())) }]
    case "txt": return [{ title, html: paragraphs(await file.text()) }]
    case "html": case "htm": return [fromHtmlPage(await file.text(), title)]
    case "enex": return fromEnex(await file.text())
    case "pdf": return [{ title, html: await fromPdf(await file.arrayBuffer()) }]
    case "pptx": return [{ title, html: await fromPptx(await file.arrayBuffer()) }]
    case "docx": return [{ title, html: await fromDocx(await file.arrayBuffer()) }]
    case "zip": return fromZip(await file.arrayBuffer())
    default: throw new Error(`ThinkInk can't read .${ext} files yet. Try PDF, PowerPoint, Word, Markdown, HTML or Evernote.`)
  }
}

// Obsidian and other Markdown apps put metadata between --- lines at the top.
const stripFrontMatter = (md: string) => md.replace(/^---\n[\s\S]*?\n---\n/, "")

function fromHtmlPage(html: string, fallback: string): Imported {
  const doc = new DOMParser().parseFromString(html, "text/html")
  const title = doc.querySelector("title")?.textContent?.trim() || doc.querySelector("h1")?.textContent?.trim() || fallback
  return { title, html: cleanHtml(doc.body?.innerHTML ?? "") }
}

/** Evernote's export: one XML file with many notes; each note's body is HTML (ENML). */
export function fromEnex(xml: string): Imported[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml")
  return [...doc.querySelectorAll("note")].slice(0, MAX_NOTES).map((n) => ({
    title: n.querySelector("title")?.textContent?.trim() || "Evernote note",
    html: cleanHtml(n.querySelector("content")?.textContent ?? ""),
  }))
}

async function fromPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  // No scripts, forms or embedded fonts from the file: we only want its text.
  const task = pdfjs.getDocument({ data, enableXfa: false, disableFontFace: true })
  const pdf = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= Math.min(pdf.numPages, 500); i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
    let text = ""
    for (const item of content.items) if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ")
    if (text.trim()) pages.push(`<h3>Page ${i}</h3>${paragraphs(text.replace(/[ \t]+\n/g, "\n"))}`)
  }
  await task.destroy()
  if (!pages.length) throw new Error("This PDF has no selectable text (it may be scanned). Take a photo of the pages instead, or export it as images.")
  return pages.join("")
}

async function unzip(data: ArrayBuffer) {
  const { default: JSZip } = await import("jszip")
  const zip = await JSZip.loadAsync(data)
  const files = Object.values(zip.files).filter((f) => !f.dir)
  let total = 0
  for (const f of files) {
    const size = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    total += size
    if (size > MAX_ENTRY * 4 || total > 300e6) throw new Error("This file unpacks to something too large to import.")
  }
  return zip
}

const xmlOf = (s: string) => new DOMParser().parseFromString(s, "application/xml")
const byNum = (a: string, b: string) => Number(a.match(/(\d+)\.xml$/)?.[1]) - Number(b.match(/(\d+)\.xml$/)?.[1])

/** PowerPoint: each slide becomes a heading with its text as bullets, plus the speaker notes. */
export async function fromPptx(data: ArrayBuffer): Promise<string> {
  const zip = await unzip(data)
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort(byNum)
  const out: string[] = []
  for (const [i, name] of slides.entries()) {
    const paras = [...xmlOf(await zip.file(name)!.async("string")).getElementsByTagName("a:p")]
      .map((p) => [...p.getElementsByTagName("a:t")].map((t) => t.textContent).join("").trim())
      .filter(Boolean)
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${name.match(/(\d+)\.xml$/)![1]}.xml`)
    const notes = notesFile
      ? [...xmlOf(await notesFile.async("string")).getElementsByTagName("a:t")].map((t) => t.textContent).join(" ").replace(/\s+/g, " ").trim()
      : ""
    const [head, ...rest] = paras
    out.push(`<h2>Slide ${i + 1}${head ? `: ${esc(head)}` : ""}</h2>` +
      (rest.length ? `<ul>${rest.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "") +
      (notes && !/^\d+$/.test(notes) ? `<blockquote><p><strong>Speaker notes:</strong> ${esc(notes)}</p></blockquote>` : ""))
  }
  if (!out.length) throw new Error("No slides found in this file.")
  return out.join("")
}

/** Word: paragraphs, headings (Heading 1-3 styles) and list items; formatting beyond that is dropped. */
export async function fromDocx(data: ArrayBuffer): Promise<string> {
  const zip = await unzip(data)
  const body = zip.file("word/document.xml")
  if (!body) throw new Error("This doesn't look like a Word document.")
  const doc = xmlOf(await body.async("string"))
  const out: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push(`<ul>${list.join("")}</ul>`); list = [] } }
  for (const p of [...doc.getElementsByTagName("w:p")]) {
    const text = [...p.getElementsByTagName("w:t")].map((t) => t.textContent).join("").trim()
    if (!text) continue
    const style = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? ""
    const level = style.match(/^Heading([1-3])$/i)?.[1] ?? (/^Title$/i.test(style) ? "1" : null)
    if (p.getElementsByTagName("w:numPr").length) { list.push(`<li>${esc(text)}</li>`); continue }
    flush()
    out.push(level ? `<h${level}>${esc(text)}</h${level}>` : `<p>${esc(text)}</p>`)
  }
  flush()
  return out.join("")
}

/** Notion and Obsidian exports: a zip of Markdown or HTML pages, one note each. */
async function fromZip(data: ArrayBuffer): Promise<Imported[]> {
  const zip = await unzip(data)
  const out: Imported[] = []
  for (const f of Object.values(zip.files)) {
    if (f.dir || out.length >= MAX_NOTES || /(^|\/)(__MACOSX|\.)/.test(f.name)) continue
    const ext = f.name.toLowerCase().split(".").pop()
    if (ext === "md" || ext === "markdown") out.push({ title: baseName(f.name), html: markdownToHtml(stripFrontMatter(await f.async("string"))) })
    else if (ext === "html" || ext === "htm") out.push(fromHtmlPage(await f.async("string"), baseName(f.name)))
    else if (ext === "txt") out.push({ title: baseName(f.name), html: paragraphs(await f.async("string")) })
    else if (ext === "enex") out.push(...fromEnex(await f.async("string")))
  }
  if (!out.length) throw new Error("No notes found in this zip (looking for .md, .html, .txt or .enex files).")
  return out
}
