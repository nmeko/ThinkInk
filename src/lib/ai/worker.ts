// Runs the in-browser AI models off the main thread so typing never stutters.
// Models download once from the Hugging Face CDN, then the browser caches them.
import { pipeline, env } from "@huggingface/transformers"

env.allowLocalModels = false

type Req =
  | { id: number; kind: "embed"; texts: string[] }
  | { id: number; kind: "transcribe"; audio: Float32Array }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: Promise<any> | null = null

const progress = (id: number) => (p: { status: string; progress?: number; file?: string }) => {
  if (p.status === "progress") self.postMessage({ id, kind: "progress", progress: Math.round(p.progress ?? 0), file: p.file })
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const msg = e.data
  try {
    if (msg.kind === "embed") {
      embedder ??= pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { progress_callback: progress(msg.id) })
      const model = await embedder
      const out = await model(msg.texts, { pooling: "mean", normalize: true })
      self.postMessage({ id: msg.id, kind: "done", result: out.tolist() })
    } else {
      transcriber ??= pipeline("automatic-speech-recognition", "onnx-community/whisper-tiny.en", { progress_callback: progress(msg.id) })
      const model = await transcriber
      const out = await model(msg.audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true })
      const chunks = (out.chunks ?? []).map((c: { timestamp: [number, number | null]; text: string }) => ({
        start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0], text: c.text.trim(),
      }))
      self.postMessage({ id: msg.id, kind: "done", result: chunks.length ? chunks : [{ start: 0, end: 0, text: String(out.text ?? "").trim() }] })
    }
  } catch (err) {
    self.postMessage({ id: msg.id, kind: "error", error: String((err as Error)?.message ?? err) })
  }
}
