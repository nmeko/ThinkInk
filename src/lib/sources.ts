// Credible places to read more. Only the search words leave the device, and only when the student searches.

export type Source = { title: string; url: string; snippet: string; meta: string; kind: "encyclopedia" | "paper" }

// A friendly message instead of "Failed to fetch" when offline or the site is unreachable.
async function get(url: string, site: string) {
  let res: Response
  try { res = await fetch(url) } catch { throw new Error(`Couldn't reach ${site}. Check your internet connection and try again.`) }
  if (!res.ok) throw new Error(`${site} didn't answer (error ${res.status}). Try again in a moment.`)
  return res.json()
}

const strip = (html: string) => new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
const httpsOnly = (u: unknown) => (typeof u === "string" && /^https:\/\//.test(u) ? u : null)

export async function searchWikipedia(q: string): Promise<Source[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=${encodeURIComponent(q)}`
  const data = await get(url, "Wikipedia")
  return (data.query?.search ?? []).map((r: { title: string; snippet: string; wordcount: number }) => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: strip(r.snippet),
    meta: "Wikipedia · a good starting point; for assignments, cite the sources it lists",
    kind: "encyclopedia" as const,
  }))
}

/** Peer-reviewed and open-access research from OpenAlex, a free index of scholarly works. */
export async function searchPapers(q: string): Promise<Source[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per_page=6&filter=is_oa:true,type:article|review|book-chapter|book&select=display_name,publication_year,primary_location,open_access,cited_by_count,doi,authorships`
  const data = await get(url, "OpenAlex (research search)")
  return (data.results ?? []).flatMap((w: {
    display_name: string; publication_year?: number; cited_by_count?: number; doi?: string
    open_access?: { oa_url?: string }; primary_location?: { source?: { display_name?: string } }
    authorships?: { author?: { display_name?: string } }[]
  }) => {
    const link = httpsOnly(w.open_access?.oa_url) ?? httpsOnly(w.doi)
    if (!link || !w.display_name) return []
    const authors = (w.authorships ?? []).slice(0, 2).map((a) => a.author?.display_name).filter(Boolean).join(", ")
    return [{
      title: strip(w.display_name),
      url: link,
      snippet: [authors && `${authors}${(w.authorships?.length ?? 0) > 2 ? " et al." : ""}`, w.primary_location?.source?.display_name].filter(Boolean).join(" · "),
      meta: [w.publication_year, `cited ${w.cited_by_count ?? 0} times`, "free to read"].filter(Boolean).join(" · "),
      kind: "paper" as const,
    }]
  })
}

/** Trusted learning sites; these open their own search in a new tab (no data sent from ThinkInk). */
export function learningLinks(q: string) {
  const e = encodeURIComponent(q)
  return [
    { name: "Khan Academy", what: "Free lessons and practice", url: `https://www.khanacademy.org/search?page_search_query=${e}` },
    { name: "YouTube: Crash Course", what: "Short, well-made explainer videos", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`crash course ${q}`)}` },
    { name: "YouTube: explained", what: "Lectures and walkthroughs", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} explained`)}` },
    { name: "MIT OpenCourseWare", what: "Real university course materials", url: `https://ocw.mit.edu/search/?q=${e}` },
    { name: "Britannica", what: "Edited encyclopedia articles", url: `https://www.britannica.com/search?query=${e}` },
    { name: "Google Scholar", what: "Research papers and citations", url: `https://scholar.google.com/scholar?q=${e}` },
  ]
}
