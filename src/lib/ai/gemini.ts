// Optional smarter AI with the user's own free Google Gemini key.
// The key stays in this browser (localStorage) and is sent only to Google.
const API = "https://generativelanguage.googleapis.com/v1beta"
const KEY = "thinkink-gemini-key"
const MODEL = "thinkink-gemini-model"
const DEFAULT_MODEL = "gemini-flash-latest"

export const getKey = () => { try { return localStorage.getItem(KEY) ?? "" } catch { return "" } }
export const setKey = (k: string) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); localStorage.removeItem(MODEL) } catch { /* storage blocked */ } }
export const hasKey = () => getKey().length > 10

// Model names change often; if the default alias is unavailable, pick the newest Flash model offered.
async function resolveModel(key: string): Promise<string> {
  const cached = localStorage.getItem(MODEL)
  if (cached) return cached
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": key } })
  if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? "That Gemini key wasn't accepted." : `Gemini error ${res.status}`)
  const { models = [] } = await res.json()
  const names: string[] = models
    .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
      m.supportedGenerationMethods?.includes("generateContent") && /flash/i.test(m.name) && !/image|tts|live|audio|embed|thinking/i.test(m.name))
    .map((m: { name: string }) => m.name.replace(/^models\//, ""))
  const pick = names.find((n) => n === DEFAULT_MODEL) ?? names.filter((n) => !/preview|exp/i.test(n)).sort().reverse()[0] ?? names[0]
  if (!pick) throw new Error("No Gemini Flash model is available for this key.")
  localStorage.setItem(MODEL, pick)
  return pick
}

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

async function generate(prompt: string, json = false, extra: Part[] = []): Promise<string> {
  const key = getKey()
  if (!key) throw new Error("Add a free Gemini key in Settings to use this.")
  const model = await resolveModel(key)
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [...extra, { text: prompt }] }],
      generationConfig: json ? { responseMimeType: "application/json", temperature: 0.3 } : { temperature: 0.4 },
    }),
  })
  if (res.status === 404) { localStorage.removeItem(MODEL); throw new Error("Gemini model not found; try again to pick a new one.") }
  if (res.status === 429) throw new Error("Gemini's free limit was reached; try again in a minute.")
  if (!res.ok) throw new Error(`Gemini error ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? ""
}

export const testKey = async () => (await generate("Reply with the single word: ok")).toLowerCase().includes("ok")

export type SummaryStyle = "simple" | "detailed"

/** "simple": for someone with no background at all; "detailed": a full study guide. */
export async function summarize(title: string, text: string, style: SummaryStyle = "simple") {
  const ask =
    style === "simple"
      ? `Explain these notes so that someone with little or no background in the subject understands them.
Use short sentences and everyday words. Define every technical term the first time it appears, give one concrete everyday example or analogy, and keep it under 250 words.
Format (Markdown): a one-sentence "In short", then "The main ideas" as 3-6 bullets, then "Words to know" with simple definitions.`
      : `Write a detailed study guide from these notes for a student preparing for an exam.
Format (Markdown): an overview paragraph; a section per main topic with headings and bullet points that keep important details, steps, formulas and examples; "Key terms" with precise definitions; "Common mistakes" if any; and 5 self-check questions at the end.`
  return generate(`${ask}\n\nThe notes are titled "${title}". Only use what the notes say; if they're thin, say what's missing instead of inventing facts.\n\nNOTES:\n${text.slice(0, 60000)}`)
}

/** Cards from the note; `request` says which cards the student wants ("10 cards on the dates"). */
export async function makeCards(text: string, request = ""): Promise<{ front: string; back: string }[]> {
  const what = request.trim()
    ? `Make flashcards exactly as the student asks: "${request.trim().slice(0, 500)}". Use the notes as the source when they cover it; if the request goes beyond the notes, use well-established facts and keep answers accurate.`
    : "Create 8-15 high-quality flashcards from these notes. Test understanding, not trivia."
  const out = await generate(`${what}\nReturn JSON: [{"front": "question", "back": "concise answer"}].\n\nNOTES:\n${text.slice(0, 30000)}`, true)
  const parsed = JSON.parse(out)
  return (Array.isArray(parsed) ? parsed : parsed.cards ?? [])
    .filter((c: { front?: unknown; back?: unknown }) => typeof c.front === "string" && typeof c.back === "string")
    .slice(0, 50)
}

export async function makeQuiz(text: string): Promise<{ question: string; choices: string[]; answer: number; why: string }[]> {
  const out = await generate(
    `Write a 6-question multiple-choice practice quiz from these notes. Each question has 4 choices and one correct answer. Return JSON: [{"question": "", "choices": ["","","",""], "answer": 0, "why": "short explanation"}].\n\nNOTES:\n${text.slice(0, 30000)}`,
    true,
  )
  const parsed = JSON.parse(out)
  return (Array.isArray(parsed) ? parsed : parsed.questions ?? []).filter(
    (q: { question?: unknown; choices?: unknown; answer?: unknown }) =>
      typeof q.question === "string" && Array.isArray(q.choices) && q.choices.length >= 2 && typeof q.answer === "number" && q.answer < q.choices.length,
  )
}

export async function answer(question: string, sources: { title: string; text: string }[]) {
  const context = sources.map((s, i) => `[${i + 1}] ${s.title}\n${s.text.slice(0, 4000)}`).join("\n\n")
  return generate(
    `Answer the question using only these notes. Cite sources like [1]. If the notes don't contain the answer, say so briefly.\n\nQUESTION: ${question}\n\nNOTES:\n${context}`,
  )
}

/** Reads handwritten or printed notes from a photo; returns Markdown. */
export async function transcribeImage(base64: string, mimeType: string) {
  return generate(
    `Transcribe the notes in this photo into clean Markdown. Keep the original wording, headings, lists and equations (write math as plain text). Fix only obvious misreadings. For a drawing or diagram, write one line like "[Diagram: …]" describing it. Do not add anything that isn't in the photo. If there is no readable text, reply "No readable text."`,
    false,
    [{ inlineData: { mimeType, data: base64 } }],
  )
}

/** A diagram (Mermaid) or an illustration (SVG) from a description. The result is sanitized and turned into a PNG by the caller. */
export async function makeVisual(description: string, context = ""): Promise<{ kind: "mermaid" | "svg"; code: string }> {
  const out = await generate(
    `A student wants a visual for their notes: "${description.slice(0, 600)}".
Choose the best form:
- For flowcharts, processes, cycles, mind maps, timelines, sequences, hierarchies, pie charts or simple charts: write Mermaid code (kind "mermaid"). Use only plain text labels in double quotes when they contain punctuation. No click handlers, links or styling directives.
- For a drawing or illustration (a cell, the solar system, a labeled object): write one self-contained SVG (kind "svg") with viewBox "0 0 640 420", a white background, simple flat shapes, clear text labels, under 12 KB. No scripts, no external images or fonts, no foreignObject.
Make it accurate and easy for a student to read.
Return JSON: {"kind": "mermaid" | "svg", "code": "..."}.${context ? `\n\nNotes for context:\n${context.slice(0, 6000)}` : ""}`,
    true,
  )
  const parsed = JSON.parse(out)
  if ((parsed.kind !== "mermaid" && parsed.kind !== "svg") || typeof parsed.code !== "string" || parsed.code.length > 60000) throw new Error("Gemini didn't return a usable picture. Try describing it differently.")
  return parsed
}
