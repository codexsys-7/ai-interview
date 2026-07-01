/**
 * Attach Silero neural VAD to an existing microphone stream.
 * Uses ONNX in-browser — distinguishes human speech from AC/keyboard noise
 * far better than FFT energy thresholds.
 *
 * vad-web is dynamically imported so it never blocks app startup.
 */
export async function createSpeechVad({ stream, onSpeechStart, onSpeechEnd }) {
  const { MicVAD } = await import("@ricky0123/vad-web")

  const vad = await MicVAD.new({
    getStream: async () => stream,
    // We manage the MediaStream lifecycle (MediaRecorder) — do not stop tracks.
    pauseStream: async () => {},
    resumeStream: async () => stream,
    baseAssetPath:
      "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/",
    onnxWASMBasePath:
      "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/",
    // Slightly strict thresholds for noisy environments (AC, keyboard).
    positiveSpeechThreshold: 0.55,
    negativeSpeechThreshold: 0.38,
    minSpeechMs: 280,
    preSpeechPadMs: 120,
    redemptionMs: 600,
    onSpeechStart: () => onSpeechStart?.(),
    onSpeechEnd: () => onSpeechEnd?.(),
    onVADMisfire: () => {},
  })

  await vad.start()
  return vad
}

export function stopSpeechVad(vad) {
  if (!vad) return
  try {
    vad.pause()
  } catch {
    /* already paused */
  }
}
