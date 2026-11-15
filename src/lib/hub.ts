import type { SupabaseClient } from "@supabase/supabase-js"
import type { JSONContent } from "@tiptap/core"
import { inviteFragment, newHubKey, open, seal, type Invite } from "./hubCrypto"

// Shared study hubs on Supabase. Members are anonymous accounts (no email). Everything people
// write is encrypted in the browser first (hubCrypto); the table rules in supabase/schema.sql
// decide who may read or write which rows.

// Public by design: the publishable key only allows what those table rules allow.
const URL = import.meta.env.VITE_SUPABASE_URL ?? "https://pafmnebyuwgsmvqvuhak.supabase.co"
const KEY = import.meta.env.VITE_SUPABASE_KEY ?? "sb_publishable_7qbE0anBzLysiEuGK2QeDQ_qBTJgGJY"
export const hubsAvailable = URL.startsWith("https://") && KEY.length > 20

export type HubPost =
  | { type: "message"; author: string; text: string }
  | { type: "note"; author: string; title: string; content: JSONContent; tags: string[] }

export type Post = { id: string; author: string; mine: boolean; at: string; data: HubPost }
export type LocalHub = Invite & { myName: string }

const MAX_POST = 1_400_000 // the database allows 1.5 MB of encrypted text per post

let client: Promise<SupabaseClient> | null = null
function db(): Promise<SupabaseClient> {
  if (!hubsAvailable) throw new Error("Shared hubs aren't set up on this site yet.")
  client ??= import("@supabase/supabase-js").then(({ createClient }) => createClient(URL, KEY, { auth: { persistSession: true, storageKey: "thinkink-hub-auth" } }))
  return client
}

/** A private, anonymous account for this browser (created the first time someone uses hubs). */
export async function me(): Promise<string> {
  const sb = await db()
  const { data } = await sb.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: signed, error } = await sb.auth.signInAnonymously()
  if (error || !signed.user) throw new Error("Couldn't connect to the hub service. Try again in a moment.")
  return signed.user.id
}

const STORE = "thinkink-hubs"
export function localHubs(): LocalHub[] {
  try { return JSON.parse(localStorage.getItem(STORE) || "[]") } catch { return [] }
}
function saveLocal(list: LocalHub[]) {
  try { localStorage.setItem(STORE, JSON.stringify(list)) } catch { /* storage blocked */ }
}
export function rememberHub(h: LocalHub) {
  saveLocal([...localHubs().filter((x) => x.hubId !== h.hubId), h])
}
export function forgetHub(hubId: string) {
  saveLocal(localHubs().filter((x) => x.hubId !== hubId))
}

export const inviteLink = (h: Invite) => `${location.origin}${location.pathname}#${inviteFragment(h)}`

export async function createHub(name: string, myName: string): Promise<LocalHub> {
  const sb = await db()
  await me()
  const { data, error } = await sb.from("hubs").insert({}).select("id").single()
  if (error || !data) throw new Error("Couldn't create the hub.")
  const { error: e2 } = await sb.from("hub_members").insert({ hub_id: data.id })
  if (e2) throw new Error("Couldn't create the hub.")
  const hub = { hubId: data.id as string, key: newHubKey(), name: name.trim().slice(0, 60) || "Study hub", myName }
  rememberHub(hub)
  return hub
}

export async function joinHub(invite: Invite, myName: string): Promise<LocalHub> {
  const sb = await db()
  await me()
  const { error } = await sb.from("hub_members").insert({ hub_id: invite.hubId })
  // 23505: already a member (rejoining from another tab or after a reload) is fine
  if (error && error.code !== "23505") throw new Error("This hub is locked or no longer exists. Ask the person who invited you.")
  const hub = { ...invite, myName }
  rememberHub(hub)
  return hub
}

export type HubInfo = { owner: boolean; locked: boolean; members: string[] }

export async function hubInfo(hubId: string): Promise<HubInfo | null> {
  const sb = await db()
  const uid = await me()
  const { data } = await sb.from("hubs").select("owner, locked").eq("id", hubId).maybeSingle()
  if (!data) return null
  const { data: m } = await sb.from("hub_members").select("user_id").eq("hub_id", hubId)
  return { owner: data.owner === uid, locked: data.locked, members: (m ?? []).map((r) => r.user_id as string) }
}

export async function setLocked(hubId: string, locked: boolean) {
  const { error } = await (await db()).from("hubs").update({ locked }).eq("id", hubId)
  if (error) throw new Error("Only the hub's creator can change that.")
}

export async function removeMember(hubId: string, userId: string) {
  const { error } = await (await db()).from("hub_members").delete().eq("hub_id", hubId).eq("user_id", userId)
  if (error) throw new Error("Couldn't remove that member.")
}

export async function leaveHub(hubId: string) {
  const sb = await db()
  await sb.from("hub_members").delete().eq("hub_id", hubId).eq("user_id", await me())
  forgetHub(hubId)
}

export async function deleteHub(hubId: string) {
  const { error } = await (await db()).from("hubs").delete().eq("id", hubId)
  if (error) throw new Error("Only the hub's creator can delete it.")
  forgetHub(hubId)
}

type Row = { id: string; author: string; iv: string; body: string; created_at: string }

async function decrypt(h: LocalHub, row: Row, uid: string): Promise<Post | null> {
  const data = await open<HubPost>(h.key, h.hubId, row)
  if (!data || (data.type !== "message" && data.type !== "note") || typeof data.author !== "string") return null
  return { id: row.id, author: row.author, mine: row.author === uid, at: row.created_at, data }
}

export async function loadPosts(h: LocalHub): Promise<Post[]> {
  const sb = await db()
  const uid = await me()
  const { data, error } = await sb.from("hub_posts").select("id, author, iv, body, created_at").eq("hub_id", h.hubId).order("created_at", { ascending: true }).limit(300)
  if (error) throw new Error("Couldn't load this hub. You may have been removed from it.")
  return (await Promise.all((data as Row[]).map((r) => decrypt(h, r, uid)))).filter(Boolean) as Post[]
}

export async function sendPost(h: LocalHub, data: HubPost) {
  const sb = await db()
  const sealed = await seal(h.key, h.hubId, data)
  if (sealed.body.length > MAX_POST) throw new Error("That note is too big to share (images make notes large). Try sharing it without its pictures.")
  const { error } = await sb.from("hub_posts").insert({ hub_id: h.hubId, ...sealed })
  if (error) throw new Error("Couldn't post. You may have been removed from this hub.")
}

export async function deletePost(id: string) {
  const { error } = await (await db()).from("hub_posts").delete().eq("id", id)
  if (error) throw new Error("Couldn't delete that post.")
}

/** New posts arrive live; returns a function that stops listening. */
export async function watchPosts(h: LocalHub, onPost: (p: Post) => void, onDelete: (id: string) => void): Promise<() => void> {
  const sb = await db()
  const uid = await me()
  const channel = sb
    .channel(`hub-${h.hubId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "hub_posts", filter: `hub_id=eq.${h.hubId}` }, async ({ new: row }) => {
      const p = await decrypt(h, row as Row, uid)
      if (p) onPost(p)
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "hub_posts" }, ({ old }) => onDelete((old as { id: string }).id))
    .subscribe()
  return () => void sb.removeChannel(channel)
}
