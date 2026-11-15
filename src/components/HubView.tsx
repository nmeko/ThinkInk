import { useCallback, useEffect, useMemo, useState } from "react"
import { generateHTML } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Image from "@tiptap/extension-image"
import Highlight from "@tiptap/extension-highlight"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { createNote, type Note } from "../lib/db"
import { displayTitle } from "../lib/text"
import { cleanHtml } from "../lib/markdown"
import { toast } from "../lib/toast"
import * as hub from "../lib/hub"
import { Icon } from "./Icon"
import { Modal } from "./Modal"

const shortId = (uid: string) => uid.slice(0, 4)
const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** Study hubs: small groups that share notes and messages, end-to-end encrypted. */
export function HubView({ notes, openHubId, onOpenNote }: { notes: Note[]; openHubId?: string; onOpenNote: (id: string) => void }) {
  const [hubs, setHubs] = useState(hub.localHubs)
  const [current, setCurrent] = useState<string | null>(openHubId ?? hubs[0]?.hubId ?? null)
  const [creating, setCreating] = useState(false)
  useEffect(() => { if (openHubId) { setHubs(hub.localHubs()); setCurrent(openHubId) } }, [openHubId])

  if (!hub.hubsAvailable) {
    return (
      <div className="view"><div className="view-inner">
        <h1>Study hubs</h1>
        <p className="notice">Shared hubs aren't set up on this site yet. Everything else in ThinkInk works without them.</p>
      </div></div>
    )
  }
  const h = hubs.find((x) => x.hubId === current)

  return (
    <div className="view"><div className="view-inner hub-layout">
      <aside className="hub-list" aria-label="Your hubs">
        <h1>Study hubs</h1>
        <p className="lead" style={{ fontSize: 14 }}>Share notes and messages with a class or study group. Everything is encrypted on your device; only people with the invite link can read it.</p>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" /> New hub</button>
        <ul>
          {hubs.map((x) => (
            <li key={x.hubId}><button className="nav-item" aria-current={x.hubId === current} onClick={() => setCurrent(x.hubId)}><Icon name="users" /><span>{x.name}</span></button></li>
          ))}
        </ul>
        {!hubs.length && <p style={{ color: "var(--muted)", fontSize: 14 }}>No hubs yet. Create one, or open an invite link a classmate sent you.</p>}
      </aside>
      {h ? <HubRoom key={h.hubId} h={h} notes={notes} onOpenNote={onOpenNote} onGone={() => { setHubs(hub.localHubs()); setCurrent(null) }} /> : <div />}
      {creating && <CreateHub onClose={() => setCreating(false)} onCreated={(x) => { setHubs(hub.localHubs()); setCurrent(x.hubId) }} />}
    </div></div>
  )
}

function CreateHub({ onClose, onCreated }: { onClose: () => void; onCreated: (h: hub.LocalHub) => void }) {
  const [name, setName] = useState("")
  const [myName, setMyName] = useState(() => hub.localHubs()[0]?.myName ?? "")
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try { const x = await hub.createHub(name, myName.trim() || "Me"); onCreated(x); onClose(); toast("Hub created. Copy the invite link to add classmates.") }
    catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="New study hub" onClose={onClose}>
      <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => { e.preventDefault(); void create() }}>
        <label className="field">Hub name<input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="BIO 101 study group" /></label>
        <label className="field">Your name in this hub<input className="input" value={myName} maxLength={30} onChange={(e) => setMyName(e.target.value)} placeholder="First name or nickname" /></label>
        <p className="notice" style={{ margin: 0 }}>No email or account needed. The hub's name, your name, and everything posted are encrypted before leaving this device.</p>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>Create hub</button>
      </form>
    </Modal>
  )
}

function HubRoom({ h, notes, onOpenNote, onGone }: { h: hub.LocalHub; notes: Note[]; onOpenNote: (id: string) => void; onGone: () => void }) {
  const [posts, setPosts] = useState<hub.Post[]>([])
  const [info, setInfo] = useState<hub.HubInfo | null>(null)
  const [error, setError] = useState("")
  const [text, setText] = useState("")
  const [sharing, setSharing] = useState("")
  const [busy, setBusy] = useState(false)
  const [manage, setManage] = useState(false)
  const [myUid, setMyUid] = useState("")
  useEffect(() => { void hub.me().then(setMyUid).catch(() => {}) }, [])

  const refresh = useCallback(async () => {
    try { setPosts(await hub.loadPosts(h)); setInfo(await hub.hubInfo(h.hubId)); setError("") }
    catch (e) { setError((e as Error).message) }
  }, [h])

  useEffect(() => {
    void refresh()
    let stop: (() => void) | undefined
    void hub.watchPosts(h, (p) => setPosts((ps) => (ps.some((x) => x.id === p.id) ? ps : [...ps, p])), (id) => setPosts((ps) => ps.filter((x) => x.id !== id))).then((s) => (stop = s))
    return () => stop?.()
  }, [h, refresh])

  // Names are chosen by members, so each shows with a short id that can't be faked.
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of posts) m.set(p.author, p.data.author.slice(0, 30))
    return m
  }, [posts])

  const send = async () => {
    setBusy(true)
    try {
      if (sharing) {
        const n = notes.find((x) => x.id === sharing)
        if (n) await hub.sendPost(h, { type: "note", author: h.myName, title: displayTitle(n), content: n.content, tags: n.tags })
        setSharing("")
      }
      if (text.trim()) { await hub.sendPost(h, { type: "message", author: h.myName, text: text.trim().slice(0, 4000) }); setText("") }
    } catch (e) { toast((e as Error).message) } finally { setBusy(false) }
  }

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(hub.inviteLink(h)); toast("Invite link copied. Anyone with it can join while the hub is unlocked.") }
    catch { prompt("Copy this invite link:", hub.inviteLink(h)) }
  }

  const live = notes.filter((n) => !n.deletedAt)

  return (
    <section className="hub-room" aria-label={h.name}>
      <header className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>{h.name}</h2>
          <small style={{ color: "var(--muted)" }}>
            {info ? `${info.members.length} member${info.members.length === 1 ? "" : "s"}` : ""}{info?.locked ? " · locked to new members" : ""} · you are {h.myName}{myUid && <> <span className="uid">#{shortId(myUid)}</span></>}
          </small>
        </div>
        <div className="row">
          <button className="btn" onClick={copyInvite}><Icon name="link" /> Copy invite link</button>
          <button className="btn btn-ghost" onClick={() => setManage(true)}><Icon name="settings" /> {info?.owner ? "Manage" : "Hub options"}</button>
        </div>
      </header>

      {error && <p className="notice error" role="alert">{error}</p>}

      <ol className="feed" aria-live="polite">
        {posts.map((p) => (
          <li key={p.id} className={p.mine ? "mine" : ""}>
            <div className="who">
              <strong>{p.mine ? "You" : names.get(p.author)}</strong> <span className="uid" title="Member id: names can be chosen freely, this can't">#{shortId(p.author)}</span>
              <time>{when(p.at)}</time>
              {(p.mine || info?.owner) && <button className="icon-btn" aria-label="Delete post" onClick={() => void hub.deletePost(p.id).then(() => setPosts((ps) => ps.filter((x) => x.id !== p.id))).catch((e) => toast(e.message))}><Icon name="trash" size={15} /></button>}
            </div>
            {p.data.type === "message" ? <p className="msg">{p.data.text}</p> : <SharedNoteCard post={p.data} onOpenNote={onOpenNote} />}
          </li>
        ))}
        {!posts.length && !error && <li className="empty-feed">Nothing here yet. Say hi or share a note.</li>}
      </ol>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <label className="sr-only" htmlFor="hub-msg">Message</label>
        <textarea id="hub-msg" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }} />
        <div className="row">
          <label className="sr-only" htmlFor="hub-note">Share a note</label>
          <select id="hub-note" className="input" style={{ flex: 1, minWidth: 160 }} value={sharing} onChange={(e) => setSharing(e.target.value)}>
            <option value="">Attach one of my notes…</option>
            {live.map((n) => <option key={n.id} value={n.id}>{displayTitle(n)}</option>)}
          </select>
          <button className="btn btn-primary" disabled={busy || (!text.trim() && !sharing)}><Icon name="send" /> Send</button>
        </div>
      </form>

      {manage && info && <ManageHub h={h} info={info} names={names} myUid={myUid} onClose={() => setManage(false)} onChanged={refresh} onGone={onGone} />}
    </section>
  )
}

function SharedNoteCard({ post, onOpenNote }: { post: Extract<hub.HubPost, { type: "note" }>; onOpenNote: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const html = useMemo(() => {
    try { return cleanHtml(generateHTML(post.content, [StarterKit, Image, Highlight, TaskList, TaskItem])) } catch { return "" }
  }, [post.content])
  const save = async () => {
    const n = await createNote({ title: String(post.title).slice(0, 200), content: post.content, tags: [...(Array.isArray(post.tags) ? post.tags.filter((t) => typeof t === "string").slice(0, 10) : []), "from-hub"] })
    toast("Saved to your notes."); onOpenNote(n.id)
  }
  return (
    <div className="shared-note">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span><Icon name="note" size={16} /> <strong>{String(post.title)}</strong></span>
        <span className="row">
          <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Read"}</button>
          <button className="btn" onClick={save}><Icon name="download" /> Save a copy</button>
        </span>
      </div>
      {open && (html ? <div className="ProseMirror preview" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="notice">This note couldn't be shown.</p>)}
    </div>
  )
}

function ManageHub({ h, info, names, myUid, onClose, onChanged, onGone }: { h: hub.LocalHub; info: hub.HubInfo; names: Map<string, string>; myUid: string; onClose: () => void; onChanged: () => Promise<void>; onGone: () => void }) {
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try { await fn(); if (done) toast(done); await onChanged() } catch (e) { toast((e as Error).message) }
  }
  return (
    <Modal title={`${h.name}: ${info.owner ? "manage" : "options"}`} onClose={onClose}>
      {info.owner && (
        <>
          <label className="row" style={{ gap: 10 }}>
            <input type="checkbox" checked={info.locked} onChange={(e) => void act(() => hub.setLocked(h.hubId, e.target.checked), e.target.checked ? "Locked: no one new can join." : "Unlocked: anyone with the invite link can join.")} />
            <span><strong>Lock the hub</strong><br /><small style={{ color: "var(--muted)" }}>Stops new people joining, even with the invite link.</small></span>
          </label>
          <h3 style={{ margin: "8px 0 0" }}>Members</h3>
          <ul className="members">
            {info.members.map((uid) => (
              <li key={uid} className="row" style={{ justifyContent: "space-between" }}>
                <span>{uid === myUid ? "You" : names.get(uid) ?? "(hasn't posted yet)"} <span className="uid">#{shortId(uid)}</span></span>
                {uid !== myUid && <button className="btn btn-ghost" onClick={() => void act(() => hub.removeMember(h.hubId, uid), "Removed. Lock the hub so they can't rejoin with the link.")}>Remove</button>}
              </li>
            ))}
          </ul>
          <button className="btn btn-danger" onClick={() => { if (confirm(`Delete "${h.name}" and everything in it for everyone? This can't be undone.`)) void act(async () => { await hub.deleteHub(h.hubId); onClose(); onGone() }, "Hub deleted.") }}><Icon name="trash" /> Delete hub for everyone</button>
        </>
      )}
      {!info.owner && (
        <button className="btn btn-danger" onClick={() => void act(async () => { await hub.leaveHub(h.hubId); onClose(); onGone() }, "You left the hub.")}><Icon name="x" /> Leave this hub</button>
      )}
    </Modal>
  )
}
