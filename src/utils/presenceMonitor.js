/**
 * Continuous camera presence monitor — detects when a face is visible in frame.
 * Uses MediaPipe Face Detector (dynamically imported to avoid blocking app startup).
 *
 * Two-phase absence flow:
 *   Phase 1 — 3s absent → onWarning (text + audio), clock resets
 *   Phase 2 — 10s still absent after warning → onAbsentTooLong
 *   Present at any time → full reset
 */

export const PRESENCE_WARN_MS = 3000
export const PRESENCE_END_AFTER_WARN_MS = 10000
const TICK_MS = 400
/** Require this many consecutive face detections before treating candidate as "back in frame" */
const PRESENT_CONFIRM_TICKS = 3

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"

export async function createPresenceMonitor({
  getVideoElement,
  getCamOn,
  onWarning,
  onAbsentTooLong,
  onPresent,
  onTick,
}) {
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision")

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE)
  const faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_MODEL,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    minDetectionConfidence: 0.5,
  })

  let absentSince = null
  /** @type {"initial" | "post_warn"} */
  let phase = "initial"
  let running = true
  let presentStreak = 0

  const detectFace = (video) => {
    try {
      const result = faceDetector.detectForVideo(video, performance.now())
      return (result.detections?.length ?? 0) > 0
    } catch {
      return false
    }
  }

  const isPresent = () => {
    if (!getCamOn()) return false

    const video = getVideoElement()
    if (!video || video.readyState < 2) return false

    const track = video.srcObject?.getVideoTracks?.()?.[0]
    if (!track || !track.enabled || track.readyState !== "live") return false

    return detectFace(video)
  }

  const resetAbsence = () => {
    absentSince = null
    phase = "initial"
    presentStreak = 0
  }

  const tick = () => {
    if (!running) return

    if (isPresent()) {
      presentStreak += 1
      if (
        presentStreak >= PRESENT_CONFIRM_TICKS &&
        (absentSince !== null || phase !== "initial")
      ) {
        resetAbsence()
        onPresent?.()
      }
      return
    }

    presentStreak = 0
    if (absentSince === null) absentSince = Date.now()
    const elapsed = Date.now() - absentSince

    if (phase === "initial") {
      onTick?.({ phase: "initial", elapsedMs: elapsed })
      if (elapsed >= PRESENCE_WARN_MS) {
        phase = "post_warn"
        absentSince = Date.now()
        onWarning?.()
        onTick?.({ phase: "post_warn", elapsedMs: 0 })
      }
      return
    }

    onTick?.({ phase: "post_warn", elapsedMs: elapsed })
    if (elapsed >= PRESENCE_END_AFTER_WARN_MS) {
      running = false
      clearInterval(intervalId)
      onAbsentTooLong?.()
    }
  }

  const intervalId = setInterval(tick, TICK_MS)

  return {
    stop() {
      running = false
      clearInterval(intervalId)
      try {
        faceDetector.close()
      } catch {
        /* already closed */
      }
    },
  }
}

export function stopPresenceMonitor(monitor) {
  monitor?.stop?.()
}
