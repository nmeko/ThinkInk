import type { JSONContent } from "@tiptap/react"

const t = (text: string, marks?: JSONContent["marks"]): JSONContent => ({ type: "text", text, ...(marks ? { marks } : {}) })
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content })
const h = (text: string): JSONContent => ({ type: "heading", attrs: { level: 2 }, content: [t(text)] })
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content: [p(...content)] })
const b = (s: string) => t(s, [{ type: "bold" }])

export const WELCOME: JSONContent = {
  type: "doc",
  content: [
    p(t("ThinkInk is a free note app that runs in your browser. Your notes stay on this device. Here's a quick tour:")),
    h("Write"),
    { type: "bulletList", content: [
      li(b("Rich text"), t(": headings, lists, checklists, highlights, images (paste or drop them in).")),
      li(b("Link ideas"), t(": type [[Lecture notes]] to link or create a note. Open the Graph to see how everything connects.")),
      li(b("Draw"), t(": turn on the pen to sketch or highlight right on top of your note.")),
      li(b("Templates"), t(": Cornell lecture notes, study guide, meeting and daily notes from the New menu.")),
    ] },
    h("Things other note apps don't combine"),
    { type: "bulletList", content: [
      li(b("Lecture Sync"), t(": record while you type. Every line remembers when you wrote it, so tapping ▶ next to it plays that moment of the lecture.")),
      li(b("Ask your notes"), t(": search by meaning and get answers that cite your own notes.")),
      li(b("Notes → flashcards"), t(": write \"Term: definition\" or Q:/A: lines and ThinkInk turns them into spaced-repetition cards and quizzes.")),
      li(b("Private AI"), t(": transcripts, summaries and search run on your device. A free Gemini key in Settings makes them smarter.")),
    ] },
    h("Try it"),
    { type: "taskList", content: [
      { type: "taskItem", attrs: { checked: false }, content: [p(t("Press Ctrl K (⌘ K on Mac) to search and jump anywhere"))] },
      { type: "taskItem", attrs: { checked: false }, content: [p(t("Make flashcards from this note, then open Study"))] },
      { type: "taskItem", attrs: { checked: false }, content: [p(t("Open [[My first note]]"))] },
    ] },
    p(t("Spaced repetition: reviewing a card just before you'd forget it")),
  ],
}
