import { describe, expect, it } from "vitest"
import { inviteFragment, newHubKey, open, readInvite, seal } from "./hubCrypto"

const HUB = "3f1c2b9a-8e7d-4c5b-9a3f-2e1d0c9b8a7f"

describe("hub encryption", () => {
  it("round-trips a post and hides its text from the server", async () => {
    const key = newHubKey()
    const post = await seal(key, HUB, { type: "message", text: "Exam is on Friday", author: "Ana" })
    expect(post.body).not.toContain("Friday")
    expect(await open(key, HUB, post)).toEqual({ type: "message", text: "Exam is on Friday", author: "Ana" })
  })

  it("can't be read with another key, in another hub, or after tampering", async () => {
    const key = newHubKey()
    const post = await seal(key, HUB, { text: "secret" })
    expect(await open(newHubKey(), HUB, post)).toBeNull()
    expect(await open(key, "00000000-0000-4000-8000-000000000000", post)).toBeNull()
    const flipped = post.body[5] === "A" ? "B" : "A"
    expect(await open(key, HUB, { ...post, body: post.body.slice(0, 5) + flipped + post.body.slice(6) })).toBeNull()
  })

  it("never reuses an IV", async () => {
    const key = newHubKey()
    const ivs = new Set(await Promise.all(Array.from({ length: 50 }, async () => (await seal(key, HUB, 1)).iv)))
    expect(ivs.size).toBe(50)
  })

  it("handles large notes", async () => {
    const key = newHubKey()
    const big = { text: "x".repeat(400_000) }
    expect(await open(key, HUB, await seal(key, HUB, big))).toEqual(big)
  })
})

describe("invite links", () => {
  it("round-trips, including non-English hub names", () => {
    const i = { hubId: HUB, key: newHubKey(), name: "Biología 101 · 生物" }
    expect(readInvite("#" + inviteFragment(i))).toEqual(i)
  })
  it("rejects damaged or hostile links", () => {
    expect(readInvite("#hub=nope")).toBeNull()
    expect(readInvite(`#hub=${HUB}.short.YQ`)).toBeNull()
    expect(readInvite(`#hub=${HUB}.${newHubKey()}.<script>`)).toBeNull()
  })
})
