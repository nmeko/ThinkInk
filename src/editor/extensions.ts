import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { Node as PMNode } from "@tiptap/pm/model"

const LINK = /\[\[([^[\]\n]{1,120})\]\]/g

/** Highlights [[Note title]] text and opens that note on click. */
export const WikiLinks = Extension.create<{ exists: (title: string) => boolean; open: (title: string) => void }>({
  name: "wikiLinks",
  addOptions() {
    return { exists: () => true, open: () => {} }
  },
  addProseMirrorPlugins() {
    const { exists, open } = this.options
    const build = (doc: PMNode) => {
      const decos: Decoration[] = []
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        for (const m of node.text.matchAll(LINK)) {
          const from = pos + (m.index ?? 0)
          const title = m[1].trim()
          decos.push(Decoration.inline(from, from + m[0].length, {
            class: exists(title) ? "wikilink" : "wikilink missing",
            "data-title": title,
            title: exists(title) ? `Open "${title}"` : `Create "${title}"`,
          }))
        }
      })
      return DecorationSet.create(doc, decos)
    }
    return [
      new Plugin({
        key: new PluginKey("wikiLinks"),
        state: {
          init: (_, { doc }) => build(doc),
          apply: (tr, old, _o, state) => (tr.docChanged || tr.getMeta("wikiRefresh") ? build(state.doc) : old),
        },
        props: {
          decorations(state) { return this.getState(state) },
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement).closest(".wikilink") as HTMLElement | null
            if (!el?.dataset.title) return false
            open(el.dataset.title)
            return true
          },
        },
      }),
    ]
  },
})

const STAMPED = ["paragraph", "heading", "listItem", "taskItem"]

/**
 * Lecture Sync: while recording, the line you're typing gets the current recording time,
 * so later you can tap it and hear what was being said.
 */
export const Timestamps = Extension.create<{ elapsed: () => number | null }>({
  name: "timestamps",
  addOptions() {
    return { elapsed: () => null }
  },
  addGlobalAttributes() {
    return [{
      types: STAMPED,
      attributes: {
        ts: {
          default: null,
          parseHTML: (el) => (el.getAttribute("data-ts") ? Number(el.getAttribute("data-ts")) : null),
          renderHTML: (attrs) => (attrs.ts == null ? {} : { "data-ts": String(attrs.ts) }),
        },
      },
    }]
  },
  addProseMirrorPlugins() {
    const { elapsed } = this.options
    return [
      new Plugin({
        key: new PluginKey("timestamps"),
        appendTransaction(trs, _old, state) {
          const t = elapsed()
          if (t == null || !trs.some((tr) => tr.docChanged)) return null
          const { $from } = state.selection
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (STAMPED.includes(node.type.name)) {
              if (node.attrs.ts != null || !node.textContent.trim()) return null
              return state.tr.setNodeMarkup($from.before(d), undefined, { ...node.attrs, ts: Math.round(t * 10) / 10 })
            }
          }
          return null
        },
      }),
    ]
  },
})
