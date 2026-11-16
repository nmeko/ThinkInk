import { useEffect, useState } from "react"
import { checkStorage, downloadBackup, type StorageCheck } from "../lib/backup"
import { Icon } from "./Icon"

const HIDE = "thinkink-storage-banner-hidden-until"
const hiddenUntil = () => { try { return Number(localStorage.getItem(HIDE) ?? 0) } catch { return 0 } }

/** Tells people their notes live only in this browser, louder in a private window. */
export function StorageBanner({ noteCount }: { noteCount: number }) {
  const [check, setCheck] = useState<StorageCheck | null>(null)
  const [hidden, setHidden] = useState(() => hiddenUntil() > Date.now())

  useEffect(() => { void checkStorage().then(setCheck) }, [])

  if (!check || check.kind === "ok" || hidden || noteCount === 0) return null
  const hide = () => {
    try { localStorage.setItem(HIDE, String(Date.now() + 14 * 864e5)) } catch { /* storage blocked */ }
    setHidden(true)
  }

  return (
    <div className="banner" role="status">
      <Icon name="alert" />
      <p>
        {check.kind === "private"
          ? <><strong>This looks like a private or incognito window.</strong> Notes made here are erased when you close it. Download a backup or export your notes before you go.</>
          : <>Your notes are saved only in this browser. Clearing browsing data deletes them, so download a backup now and then.</>}
      </p>
      <button className="btn btn-primary" onClick={() => void downloadBackup()}><Icon name="download" /> Back up</button>
      <button className="btn btn-ghost" onClick={hide}>{check.kind === "private" ? "I understand" : "Remind me later"}</button>
    </div>
  )
}
