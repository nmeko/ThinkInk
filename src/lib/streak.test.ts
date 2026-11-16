// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"
import { currentStreak, recordStudy } from "./streak"

beforeEach(() => localStorage.clear())
const at = (s: string) => new Date(`${s}T12:00:00`)

it("counts consecutive days, once per day", () => {
  expect(currentStreak(at("2026-03-01"))).toBe(0)
  expect(recordStudy(at("2026-03-01"))).toBe(1)
  expect(recordStudy(at("2026-03-01"))).toBe(1)
  expect(recordStudy(at("2026-03-02"))).toBe(2)
  expect(currentStreak(at("2026-03-03"))).toBe(2) // still alive until the day ends
})

it("resets after a missed day", () => {
  recordStudy(at("2026-03-01")); recordStudy(at("2026-03-02"))
  expect(currentStreak(at("2026-03-04"))).toBe(0)
  expect(recordStudy(at("2026-03-04"))).toBe(1)
})
