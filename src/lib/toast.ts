// Minimal app-wide toast messages.
type Listener = (msg: string | null) => void
const listeners = new Set<Listener>()
let timer: ReturnType<typeof setTimeout> | undefined

export function toast(msg: string) {
  listeners.forEach((l) => l(msg))
  clearTimeout(timer)
  timer = setTimeout(() => listeners.forEach((l) => l(null)), 3500)
}

export function onToast(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
