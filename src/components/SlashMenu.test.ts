import { expect, it } from "vitest"
import { matchSlash } from "./SlashMenu"

it("filters blocks by any word of their name", () => {
  expect(matchSlash("").length).toBe(9)
  expect(matchSlash("he").map((i) => i.label)).toEqual(["Heading 1", "Heading 2", "Heading 3"])
  expect(matchSlash("list").map((i) => i.label)).toEqual(["Bullet list", "Numbered list"])
  expect(matchSlash("zzz")).toEqual([])
})
