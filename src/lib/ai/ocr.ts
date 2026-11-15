import * as gemini from "./gemini"
import { markdownToHtml } from "../markdown"

/** Shrinks a photo to at most `max` pixels on its longest side as a JPEG, so notes stay small. */
export async function shrinkImage(file: Blob, max = 1600): Promise<{ dataUrl: string; base64: string }> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) })
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82)
  return { dataUrl, base64: dataUrl.split(",")[1] }
}

/**
 * Turns a photo of notes into a note: the photo on top, the text underneath.
 * With a Gemini key, Gemini reads handwriting too; without one, Tesseract reads printed text on this device.
 */
export async function photoToNote(file: File, onProgress?: (pct: number) => void): Promise<{ html: string; usedAi: boolean }> {
  const { dataUrl, base64 } = await shrinkImage(file)
  const photo = `<p><img src="${dataUrl}" alt="Photo of the original notes"></p>`
  if (gemini.hasKey()) {
    const md = await gemini.transcribeImage(base64, "image/jpeg")
    return { html: photo + markdownToHtml(md), usedAi: true }
  }
  const { createWorker } = await import("tesseract.js")
  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && onProgress?.(Math.round(m.progress * 100)),
  })
  try {
    const { data } = await worker.recognize(dataUrl)
    const text = data.text.trim()
    const body = text
      ? text.split(/\n{2,}/).map((p) => `<p>${p.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!).replace(/\n/g, "<br>")}</p>`).join("")
      : "<p>No printed text was found. For handwriting, add a free Gemini key in Settings and import the photo again.</p>"
    return { html: photo + body, usedAi: false }
  } finally {
    await worker.terminate()
  }
}
