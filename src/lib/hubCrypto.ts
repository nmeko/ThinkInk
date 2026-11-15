// End-to-end encryption for shared hubs. The server only ever sees ciphertext; the key travels
// in the invite link after "#", which browsers never send to any server.

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const b64 = (bytes: Uint8Array) => {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export const newHubKey = () => b64url(crypto.getRandomValues(new Uint8Array(32)))

const keys = new Map<string, Promise<CryptoKey>>()
function aesKey(key: string): Promise<CryptoKey> {
  if (!keys.has(key)) {
    const raw = unb64url(key)
    if (raw.length !== 32) throw new Error("This hub link is damaged.")
    keys.set(key, crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]))
  }
  return keys.get(key)!
}

/** Encrypts a post. The hub id is bound in as extra data, so a post can't be copied into another hub. */
export async function seal(key: string, hubId: string, data: unknown): Promise<{ iv: string; body: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(hubId) }, await aesKey(key), plain)
  return { iv: b64url(iv), body: b64(new Uint8Array(cipher)) }
}

/** Decrypts a post, or returns null if it was tampered with or made with another key. */
export async function open<T>(key: string, hubId: string, post: { iv: string; body: string }): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64url(post.iv), additionalData: new TextEncoder().encode(hubId) }, await aesKey(key), unb64(post.body))
    return JSON.parse(new TextDecoder().decode(plain)) as T
  } catch {
    return null
  }
}

export type Invite = { hubId: string; key: string; name: string }

/** #hub=<id>.<key>.<name>: everything needed to join, kept in the part of the URL servers never see. */
export function inviteFragment(i: Invite): string {
  return `hub=${i.hubId}.${i.key}.${b64url(new TextEncoder().encode(i.name.slice(0, 60)))}`
}

export function readInvite(hash: string): Invite | null {
  const m = hash.match(/^#?hub=([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{0,120})$/)
  if (!m) return null
  try {
    return { hubId: m[1], key: m[2], name: new TextDecoder().decode(unb64url(m[3])).slice(0, 60) || "Study hub" }
  } catch {
    return null
  }
}
