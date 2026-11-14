import type { JSONContent } from "@tiptap/react"

const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "blockquote", "codeBlock"])

/** Plain text of an editor document, one line per block. */
export function noteText(doc: JSONContent | undefined): string {
  const lines: string[] = []
  let current = ""
  const walk = (node: JSONContent) => {
    if (node.type === "text") current += node.text ?? ""
    else if (node.type === "hardBreak") current += "\n"
    node.content?.forEach(walk)
    if (node.type && BLOCKS.has(node.type) && !node.content?.some((c) => c.type && BLOCKS.has(c.type))) {
      if (current.trim()) lines.push(current.trim())
      current = ""
    }
  }
  if (doc) walk(doc)
  if (current.trim()) lines.push(current.trim())
  return lines.join("\n")
}

/** Titles referenced as [[Title]] in text, unique, in order. */
export function wikiLinks(text: string): string[] {
  const found = new Set<string>()
  for (const m of text.matchAll(/\[\[([^[\]\n]{1,120})\]\]/g)) found.add(m[1].trim())
  return [...found].filter(Boolean)
}

export const displayTitle = (n: { title: string; text: string }) =>
  n.title.trim() || n.text.split("\n")[0]?.slice(0, 60) || "Untitled"

/** Markdown export of an editor document. */
export function toMarkdown(title: string, doc: JSONContent | undefined): string {
  const inline = (nodes: JSONContent[] = []): string =>
    nodes
      .map((n) => {
        if (n.type === "hardBreak") return "  \n"
        let t = n.text ?? ""
        for (const m of n.marks ?? []) {
          if (m.type === "bold") t = `**${t}**`
          else if (m.type === "italic") t = `*${t}*`
          else if (m.type === "strike") t = `~~${t}~~`
          else if (m.type === "code") t = "`" + t + "`"
          else if (m.type === "link") t = `[${t}](${m.attrs?.href})`
        }
        return t
      })
      .join("")
  const block = (n: JSONContent, depth = 0): string => {
    const pad = "  ".repeat(depth)
    switch (n.type) {
      case "heading": return "#".repeat(n.attrs?.level ?? 1) + " " + inline(n.content)
      case "paragraph": return inline(n.content)
      case "blockquote": return (n.content ?? []).map((c) => "> " + block(c)).join("\n")
      case "codeBlock": return "```\n" + inline(n.content) + "\n```"
      case "horizontalRule": return "---"
      case "image": return `![${n.attrs?.alt ?? ""}](image)`
      case "bulletList":
      case "orderedList":
      case "taskList":
        return (n.content ?? [])
          .map((li, i) => {
            const marker = n.type === "orderedList" ? `${i + 1}.` : n.type === "taskList" ? `- [${li.attrs?.checked ? "x" : " "}]` : "-"
            const [first, ...rest] = li.content ?? []
            return [pad + marker + " " + (first ? block(first) : ""), ...rest.map((c) => block(c, depth + 1))].join("\n")
          })
          .join("\n")
      default: return inline(n.content)
    }
  }
  const body = (doc?.content ?? []).map((b) => block(b)).join("\n\n")
  return (title ? `# ${title}\n\n` : "") + body + "\n"
}

/** Keyword search score: every word must match; title and tag matches count most. */
export function keywordScore(query: string, n: { title: string; text: string; tags: string[]; transcriptText?: string }): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 0
  const title = n.title.toLowerCase(), text = n.text.toLowerCase(), tags = n.tags.join(" ").toLowerCase()
  const transcript = (n.transcriptText ?? "").toLowerCase()
  let score = 0
  for (const w of words) {
    const s = (title.includes(w) ? 5 : 0) + (tags.includes(w) ? 4 : 0) + (text.includes(w) ? 2 : 0) + (transcript.includes(w) ? 1 : 0)
    if (!s) return 0
    score += s
  }
  return score
}

/** A short excerpt around the first match, for search results. */
export function snippet(text: string, query: string, size = 120): string {
  const flat = text.replace(/\s+/g, " ")
  const word = query.toLowerCase().split(/\s+/).find(Boolean)
  const i = word ? flat.toLowerCase().indexOf(word) : -1
  if (i < 0) return flat.slice(0, size)
  const start = Math.max(0, i - size / 3)
  return (start > 0 ? "…" : "") + flat.slice(start, start + size) + (start + size < flat.length ? "…" : "")
}

/** Split text into sentences (good enough for study cards and summaries). */
export const sentences = (text: string) =>
  text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 3)
