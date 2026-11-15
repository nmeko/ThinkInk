import { marked } from "marked"
import DOMPurify from "dompurify"

// Every piece of HTML that enters ThinkInk (AI answers, imported files) passes through here.
// Scripts, event handlers and styles are removed; links must be http(s) or mailto; images must be
// embedded (data:/blob:), because a remote image would tell its server who opened the note.
const SAFE_LINK = /^(https?:|mailto:)/i
const SAFE_IMG = /^(data:image\/(png|jpe?g|gif|webp);|blob:)/i

let hooked = false
function hook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") ?? ""
      if (!SAFE_LINK.test(href)) node.removeAttribute("href")
      else { node.setAttribute("target", "_blank"); node.setAttribute("rel", "noopener noreferrer") }
    }
    if (node.tagName === "IMG" && !SAFE_IMG.test(node.getAttribute("src") ?? "")) node.remove()
  })
}

export function cleanHtml(html: string): string {
  hook()
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "b", "em", "i", "u", "s", "mark", "code", "pre", "blockquote", "a", "img", "hr", "table", "thead", "tbody", "tr", "th", "td", "sub", "sup"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "target", "rel", "colspan", "rowspan"],
  })
}

export function markdownToHtml(md: string): string {
  return cleanHtml(marked.parse(md, { async: false, gfm: true, breaks: false }) as string)
}
