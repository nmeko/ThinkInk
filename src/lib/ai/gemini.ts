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

async function generate(prompt: string, json = false): Promise<string> {
  const key = getKey()
  if (!key) throw new Error("Add a free Gemini key in Settings to use this.")
  const model = await resolveModel(key)
  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
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

export async function summarize(title: string, text: string) {
  return generate(`Summarize these study notes titled "${title}" for a student in 4-6 short bullet points, then list up to 5 key terms with one-line definitions. Use plain Markdown.\n\nNOTES:\n${text.slice(0, 30000)}`)
}

export async function makeCards(text: string): Promise<{ front: string; back: string }[]> {
  const out = await generate(
    `Create 8-15 high-quality flashcards from these notes. Test understanding, not trivia. Return JSON: [{"front": "question", "back": "concise answer"}].\n\nNOTES:\n${text.slice(0, 30000)}`,
    true,
  )
  const parsed = JSON.parse(out)
  return (Array.isArray(parsed) ? parsed : parsed.cards ?? [])
    .filter((c: { front?: unknown; back?: unknown }) => typeof c.front === "string" && typeof c.back === "string")
    .slice(0, 30)
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
