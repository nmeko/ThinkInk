import type { JSONContent } from "@tiptap/react"

const p = (text = ""): JSONContent => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" })
const h = (level: number, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] })
const bullets = (...items: string[]): JSONContent => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) })
const tasks = (...items: string[]): JSONContent => ({ type: "taskList", content: items.map((t) => ({ type: "taskItem", attrs: { checked: false }, content: [p(t)] })) })
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content })

export type Template = { id: string; name: string; description: string; title: (date: string) => string; content: JSONContent }

export const TEMPLATES: Template[] = [
  { id: "blank", name: "Blank note", description: "Start from scratch", title: () => "", content: doc(p()) },
  {
    id: "lecture",
    name: "Lecture (Cornell)",
    description: "Cues, notes and a summary, the classic study layout",
    title: (d) => `Lecture: ${d}`,
    content: doc(
      h(2, "Key questions / cues"), bullets("What is the main idea?"),
      h(2, "Notes"), p("Tip: press Record to sync your notes with the lecture audio."),
      h(2, "Terms"), p("Term: definition"),
      h(2, "Summary"), p(),
    ),
  },
  {
    id: "study",
    name: "Study guide",
    description: "Q/A pairs that turn straight into flashcards",
    title: () => "Study guide",
    content: doc(h(2, "Must-know terms"), p("Term: definition"), h(2, "Practice questions"), p("Q: "), p("A: "), h(2, "Still confused about"), tasks("")),
  },
  {
    id: "meeting",
    name: "Meeting / group project",
    description: "Agenda, notes and action items",
    title: (d) => `Meeting: ${d}`,
    content: doc(h(2, "Agenda"), bullets(""), h(2, "Notes"), p(), h(2, "Action items"), tasks("Who does what, by when")),
  },
  {
    id: "daily",
    name: "Daily page",
    description: "Today's plan and quick thoughts",
    title: (d) => d,
    content: doc(h(2, "Today"), tasks(""), h(2, "Notes"), p()),
  },
]

export const today = () => new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
