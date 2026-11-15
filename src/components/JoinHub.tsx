import { useState } from "react"
import type { Invite } from "../lib/hubCrypto"
import { hubsAvailable, joinHub, localHubs } from "../lib/hub"
import { Modal } from "./Modal"

/** Opening an invite link: confirm, pick a name, join. Nothing is sent until "Join". */
export function JoinHub({ invite, onClose, onJoined }: { invite: Invite; onClose: () => void; onJoined: (hubId: string) => void }) {
  const [name, setName] = useState(() => localHubs()[0]?.myName ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const join = async () => {
    setBusy(true); setError("")
    try { await joinHub(invite, name.trim() || "Classmate"); onJoined(invite.hubId) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Join a study hub" onClose={onClose}>
      {!hubsAvailable ? <p className="notice" style={{ margin: 0 }}>Shared hubs aren't set up on this site yet.</p> : (
        <form style={{ display: "grid", gap: 12 }} onSubmit={(e) => { e.preventDefault(); void join() }}>
          <p style={{ margin: 0 }}>You were invited to <strong>{invite.name}</strong>.</p>
          <label className="field">Your name in this hub<input className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="First name or nickname" /></label>
          <p className="notice" style={{ margin: 0 }}>No email or account needed. Messages and notes in this hub are encrypted on your device; the hub's server can't read them. Only join hubs from people you know.</p>
          {error && <p className="notice error" role="alert" style={{ margin: 0 }}>{error}</p>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Not now</button>
            <button className="btn btn-primary" disabled={busy}>Join hub</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
