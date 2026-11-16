// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { Inky } from "./Inky"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never

let host: HTMLDivElement
const mount = async (ui: React.ReactNode) => {
  host = document.body.appendChild(document.createElement("div"))
  await act(async () => createRoot(host).render(ui))
}
const button = (name: RegExp) => [...host.querySelectorAll("button")].find((b) => name.test(b.textContent + " " + (b.getAttribute("aria-label") ?? "")))!
afterEach(() => { host.remove(); localStorage.clear() })

it("opens, asks what you need, and sends note actions to the editor", async () => {
  const seen: string[] = []
  window.addEventListener("thinkink-inky", (e) => seen.push((e as CustomEvent<string>).detail))
  await mount(<Inky note={{ title: "Cells", text: "Mitochondria make energy." }} onNavigate={() => {}} />)
  await act(async () => button(/Open Inky/).click())
  expect(host.textContent).toContain('What do you need help with in "Cells"?')
  await act(async () => button(/Make flashcards/).click())
  expect(seen).toEqual(["cards"])
})

it("without an AI key, a typed question searches your notes", async () => {
  const nav = vi.fn()
  await mount(<Inky onNavigate={nav} />)
  await act(async () => button(/Open Inky/).click())
  const box = host.querySelector("textarea")!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "what is osmosis")
    box.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => host.querySelector<HTMLButtonElement>(".inky-ask button")!.click())
  expect(nav).toHaveBeenCalledWith("ask", "what is osmosis")
})
