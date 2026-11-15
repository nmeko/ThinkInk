import { describe, expect, it } from "vitest"
import { barChartSvg, parseFormula, plotSvg } from "./visuals"

describe("formula parser", () => {
  it.each([
    ["2x^2 - 3x + 1", 3, 10],
    ["y = x^2", -3, 9],
    ["f(x) = 3(x+1)", 1, 6],
    ["sin(pi/2)", 0, 1],
    ["-x^2", 2, -4],
    ["2^3^2", 0, 512],
    ["sqrt(abs(x))", -16, 4],
    ["2·x − 1", 5, 9],
    ["x sin(0)", 5, 0],
    ["e^0 + ln(e)", 0, 2],
  ])("%s at x=%s is %s", (f, x, y) => expect(parseFormula(f)(x)).toBeCloseTo(y))

  it.each(["", "2x +", "alert(1)", "x)", "constructor", "x".repeat(300)])("rejects %s", (f) => expect(() => parseFormula(f)).toThrow())
})

describe("graphs", () => {
  it("plots without breaking at asymptotes", () => {
    const svg = plotSvg(["1/x", "tan(x)"], -5, 5)
    expect(svg).toMatch(/^<svg/)
    expect(svg).not.toMatch(/NaN|Infinity/)
  })
  it("escapes labels in bar charts", () => {
    const svg = barChartSvg("<b>A</b>: 3\nB, 5\nnot a row", "Test & <script>")
    expect(svg).toContain("&lt;b&gt;A&lt;/b&gt;")
    expect(svg).not.toContain("<script")
    expect(svg.match(/<rect x=/g)?.length).toBe(2)
  })
})
