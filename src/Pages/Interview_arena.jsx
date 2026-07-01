import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiTranscribe, apiSubmitAnswerRealtime, apiSubmitFollowup, apiGetNextQuestion, apiRephraseQuestion, apiGenerateTts } from "@/api/client"
import { trackInterviewStream, untrackInterviewStream, releaseAllInterviewMedia } from "@/utils/interviewMedia"
import { createSpeechVad, stopSpeechVad } from "@/utils/speechVad"
import {
  createPresenceMonitor,
  stopPresenceMonitor,
  PRESENCE_END_AFTER_WARN_MS,
} from "@/utils/presenceMonitor"

// ─────────────────────────────────────────────────────────────────────────────
// Audio queue builder
// isFollowUp = true  → ack + probe only   (never transition / next question)
// isFollowUp = false → ack + transition + next question (never probe)
// ─────────────────────────────────────────────────────────────────────────────
function buildAudioQueue(aiResponse, nextQuestion, isFollowUp = false) {
  const items = []
  if (aiResponse?.acknowledgment?.audio_url)
    items.push({ url: aiResponse.acknowledgment.audio_url, label: "acknowledgment" })

  if (isFollowUp) {
    if (aiResponse?.follow_up_probe?.audio_url)
      items.push({ url: aiResponse.follow_up_probe.audio_url, label: "follow_up" })
  } else {
    if (aiResponse?.transition?.audio_url)
      items.push({ url: aiResponse.transition.audio_url, label: "transition" })
    if (nextQuestion?.interviewer_comment_audio_url)
      items.push({ url: nextQuestion.interviewer_comment_audio_url, label: "comment" })
    if (nextQuestion?.question?.audio_url)
      items.push({ url: nextQuestion.question.audio_url, label: "question" })
  }
  return items
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
// Listen-mode timing — speech detection uses Silero VAD (see utils/speechVad.js)
const SILENCE_AFTER_SPEECH_MS = 5000   // auto-submit after this many ms of silence
const MIC_CONSTRAINTS = {
  channelCount: 1,
  echoCancellation: true,
  autoGainControl: true,
  noiseSuppression: true,
}
const FIRST_COUNTDOWN_S = 12   // seconds of silence before auto rephrase
const MAX_CONSECUTIVE_SILENT_SKIPS = 3  // end interview after this many silent questions in a row

// Short meta-phrases that mean "please repeat the question" — NOT an interview answer.
// Word count guard (< 15 words) prevents accidentally catching a real answer that
// happens to contain one of these words in the middle of a longer response.
const REPEAT_REQUEST_REGEX =
  /\b(repeat|say that again|come again|could you|what did you say|what was the question|pardon|didn.?t catch|didn.?t hear|missed that|one more time|once more|could you please|please repeat|say it again)\b/i

const MOTIVATIONAL_MESSAGES = [
  "You don't have to be nervous. Just take a breath — you've got this.",
  "Drink some water if you have some. It helps. Take your time.",
  "It's completely normal to feel nervous. But you're more prepared than you think.",
  "Just be yourself. Answer what you know — there's no trick here.",
  "I'm rooting for you. Speak naturally, like you would with a colleague.",
  "Remember, I'm here to understand how you think, not to catch you out.",
]

// Utility: speak text via browser SpeechSynthesis (fallback for repeat/motivational)
// TODO: upgrade to match the interviewer's OpenAI TTS voice via a /api/tts endpoint
function speakText(text, onEnd = () => {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    setTimeout(onEnd, 2500)
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.88
  utterance.pitch = 1
  utterance.onend = onEnd
  utterance.onerror = onEnd
  window.speechSynthesis.speak(utterance)
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function InterviewArenaPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // DOM / media refs
  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioRef = useRef(null)
  const streamRef = useRef(null)
  const listeningStreamRef = useRef(null) // audio-only stream used for recording

  // De-dup guard
  const usedQuestionIdsRef = useRef(new Set())

  // Web Audio API refs (volume monitoring)
  const analyserRef = useRef(null)
  const audioContextRef = useRef(null)
  const volumeFrameRef = useRef(null)
  const sileroVadRef = useRef(null)
  const consecutiveSilentSkipsRef = useRef(0)
  const handleSkipToNextRef = useRef(null)
  const presenceMonitorRef = useRef(null)
  const presenceEndedRef = useRef(false)
  const isCamOnRef = useRef(true)
  const sessionRef = useRef(null)
  const playInterviewerSpeechRef = useRef(null)

  // Timer refs
  const countdownIntervalRef = useRef(null)
  const silenceAfterSpeechRef = useRef(null)

  // State mirrors (readable inside rAF / setTimeout without stale closures)
  const listenPhaseRef = useRef("idle")
  const hasSpeechRef = useRef(false)
  const repeatAttemptRef = useRef(false)
  const waitingForFollowUpRef = useRef(false)

  // Callback refs — always point at the latest version of the function
  const autoSubmitRef = useRef(null)
  const startListeningModeRef = useRef(null)
  const startListeningSecondChanceRef = useRef(null)

  // ── Session state ──────────────────────────────────────────────────────────
  const [session, setSession] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)

  // Audio unlock: browsers block autoplay on programmatic navigation (no user gesture).
  // We show a "Ready?" overlay; clicking it gives us a gesture so audio.play() succeeds.
  const [readyToStart, setReadyToStart] = useState(false)
  const pendingFirstAudioRef = useRef(null) // stores { url } until user clicks Ready

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [displayedText, setDisplayedText] = useState("")
  const [statusText, setStatusText] = useState("Loading interview...")
  const [error, setError] = useState("")
  const [presenceWarning, setPresenceWarning] = useState(false)
  const [presenceSecondsLeft, setPresenceSecondsLeft] = useState(0)

  // ── Follow-up state ────────────────────────────────────────────────────────
  const [waitingForFollowUp, setWaitingForFollowUp] = useState(false)
  const [followUpProbeText, setFollowUpProbeText] = useState("")

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ topics: 0, connections: 0, patterns: 0 })

  // ── Audio playback — imperative ref-based (no state machine) ──────────────
  // activePlayIdRef: incremented each time a new queue starts.
  // Each play-loop captures its own id; if id changes it knows it was cancelled.
  const activePlayIdRef = useRef(0)
  const interviewActiveRef = useRef(true)
  const aiAudioBusyRef = useRef(false)
  const isAISpeakingRef = useRef(false)
  const pendingPresenceWarningAudioRef = useRef(false)
  const playPresenceWarningAudioRef = useRef(null)
  const tryFlushPendingPresenceWarningRef = useRef(null)
  const presenceEndNavigatedRef = useRef(false)
  const pendingResumeListenRef = useRef(false)

  // ── Listen-mode state ──────────────────────────────────────────────────────
  // Phases:
  //   idle            → not listening (AI is speaking or processing)
  //   countdown       → waiting for user to start speaking (20s timer)
  //   speaking        → user detected, recording in progress
  //   processing      → transcribing + submitting to backend
  //   motivating      → brief encouragement before skipping to next question
  const [listenPhase, setListenPhase] = useState("idle")
  const [countdownValue, setCountdownValue] = useState(FIRST_COUNTDOWN_S)
  const [audioLevel, setAudioLevel] = useState(0)

  // Convenience: keep ref in sync with state
  const setPhase = useCallback((phase) => {
    listenPhaseRef.current = phase
    setListenPhase(phase)
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    clearInterval(countdownIntervalRef.current)
    clearTimeout(silenceAfterSpeechRef.current)
  }, [])

  const stopListeningStream = useCallback(() => {
    stopSpeechVad(sileroVadRef.current)
    sileroVadRef.current = null
    if (mediaRecorderRef.current?.state !== "inactive") {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    mediaRecorderRef.current = null
    if (listeningStreamRef.current) {
      untrackInterviewStream(listeningStreamRef.current)
      listeningStreamRef.current.getTracks().forEach((t) => t.stop())
      listeningStreamRef.current = null
    }
  }, [])

  // Hard-stop all interviewer audio (queue, TTS clip, SpeechSynthesis)
  const stopAllAIAudio = useCallback(() => {
    activePlayIdRef.current++
    aiAudioBusyRef.current = false
    window.speechSynthesis?.cancel()
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsAISpeaking(false)
  }, [])

  const finishAIPlayback = useCallback((myId, { onComplete, skipFlushPending = false, bypassActiveCheck = false } = {}) => {
    if (activePlayIdRef.current !== myId) return
    setIsAISpeaking(false)
    aiAudioBusyRef.current = false
    if (!bypassActiveCheck && !interviewActiveRef.current) return
    if (!skipFlushPending && pendingPresenceWarningAudioRef.current) {
      tryFlushPendingPresenceWarningRef.current?.()
      return
    }
    onComplete?.()
  }, [])

  // Release camera/mic/VAD hardware — does NOT mark interview ended (safe for effect re-runs)
  const releaseAllMedia = useCallback(() => {
    clearAllTimers()
    stopPresenceMonitor(presenceMonitorRef.current)
    presenceMonitorRef.current = null
    stopAllAIAudio()
    stopListeningStream()

    const seen = new Set()
    const stopStream = (stream) => {
      if (!stream || seen.has(stream)) return
      seen.add(stream)
      stream.getTracks().forEach((t) => t.stop())
    }
    stopStream(streamRef.current)
    stopStream(listeningStreamRef.current)
    if (videoRef.current?.srcObject instanceof MediaStream) {
      stopStream(videoRef.current.srcObject)
    }
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null

    releaseAllInterviewMedia()

    if (volumeFrameRef.current) {
      cancelAnimationFrame(volumeFrameRef.current)
      volumeFrameRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [clearAllTimers, stopListeningStream, stopAllAIAudio])

  // ── Play audio queue — fully imperative, no React state sequencing ─────────
  // Why: the old useEffect approach had a bug where React's cleanup function
  // `return () => { audio.pause() }` fired between renders and cut audio short.
  // This version plays clips directly via a recursive callback — no state involved.
  const playAudioQueue = useCallback((queue) => {
    if (!interviewActiveRef.current) return

    stopAllAIAudio()
    const myId = ++activePlayIdRef.current
    aiAudioBusyRef.current = true

    if (!queue || queue.length === 0) {
      finishAIPlayback(myId)
      setPhase("idle")
      if (interviewActiveRef.current && !pendingPresenceWarningAudioRef.current) {
        startListeningModeRef.current?.()
      }
      return
    }

    setIsAISpeaking(true)
    setPhase("idle")

    let index = 0

    const playNext = () => {
      if (!interviewActiveRef.current || activePlayIdRef.current !== myId) return

      if (index >= queue.length) {
        const shouldStartListening = !pendingPresenceWarningAudioRef.current
        finishAIPlayback(myId)
        if (
          shouldStartListening &&
          interviewActiveRef.current &&
          !pendingPresenceWarningAudioRef.current &&
          !aiAudioBusyRef.current
        ) {
          startListeningModeRef.current?.()
        }
        return
      }

      const item = queue[index++]
      const audio = new Audio(item.url)
      audioRef.current = audio

      audio.onended = playNext
      audio.onerror = playNext
      audio.play().catch(playNext)
    }

    playNext()
  }, [setPhase, stopAllAIAudio, finishAIPlayback])

  // Speak short lines (motivation, wrap-up) with the same OpenAI TTS voice as questions
  const playInterviewerSpeech = useCallback(async (
    text,
    {
      voice,
      context = "encouragement",
      onComplete,
      bypassActiveCheck = false,
      skipFlushPending = false,
    } = {}
  ) => {
    const trimmed = text?.trim()
    if (!trimmed) {
      onComplete?.()
      return
    }
    if (!bypassActiveCheck && !interviewActiveRef.current) return

    aiAudioBusyRef.current = true

    try {
      const res = await apiGenerateTts({
        text: trimmed,
        voice: voice || session?.interviewer?.voice,
        context,
      })

      if (!bypassActiveCheck && !interviewActiveRef.current) {
        aiAudioBusyRef.current = false
        return
      }

      if (res.audio_url) {
        stopAllAIAudio()
        const myId = ++activePlayIdRef.current
        aiAudioBusyRef.current = true
        setIsAISpeaking(true)
        setPhase("idle")

        const audio = new Audio(res.audio_url)
        audioRef.current = audio
        const finish = () => finishAIPlayback(myId, { onComplete, skipFlushPending, bypassActiveCheck })
        audio.onended = finish
        audio.onerror = finish
        audio.play().catch(finish)
      } else {
        aiAudioBusyRef.current = false
        speakText(trimmed, () => {
          if (!bypassActiveCheck && !interviewActiveRef.current) return
          onComplete?.()
        })
      }
    } catch {
      aiAudioBusyRef.current = false
      if (!bypassActiveCheck && !interviewActiveRef.current) return
      speakText(trimmed, () => {
        if (!bypassActiveCheck && !interviewActiveRef.current) return
        onComplete?.()
      })
    }
  }, [session, setPhase, stopAllAIAudio, finishAIPlayback])

  const tryFlushPendingPresenceWarning = useCallback(() => {
    if (!interviewActiveRef.current) return
    if (!pendingPresenceWarningAudioRef.current) return
    if (aiAudioBusyRef.current || isAISpeakingRef.current) return
    playPresenceWarningAudioRef.current?.()
  }, [])

  const resumeInterviewListen = useCallback(() => {
    if (!interviewActiveRef.current) return
    if (aiAudioBusyRef.current || isAISpeakingRef.current) return
    if (listenPhaseRef.current !== "idle") return
    startListeningModeRef.current?.()
  }, [])

  const resumeInterviewListenRef = useRef(resumeInterviewListen)
  useEffect(() => { resumeInterviewListenRef.current = resumeInterviewListen }, [resumeInterviewListen])

  const playPresenceWarningAudio = useCallback(() => {
    if (!interviewActiveRef.current) return
    pendingPresenceWarningAudioRef.current = false
    stopAllAIAudio()
    clearAllTimers()
    stopListeningStream()
    setPhase("idle")
    setStatusText("Please return to the camera frame")
    playInterviewerSpeech(
      "Please turn on your camera and stay in frame so we can continue the interview.",
      {
        voice: sessionRef.current?.interviewer?.voice,
        context: "encouragement",
        skipFlushPending: true,
        onComplete: () => {
          if (pendingResumeListenRef.current) {
            pendingResumeListenRef.current = false
            resumeInterviewListenRef.current?.()
          }
        },
      }
    )
  }, [stopAllAIAudio, clearAllTimers, stopListeningStream, setPhase, playInterviewerSpeech])

  useEffect(() => { playInterviewerSpeechRef.current = playInterviewerSpeech }, [playInterviewerSpeech])
  useEffect(() => { playPresenceWarningAudioRef.current = playPresenceWarningAudio }, [playPresenceWarningAudio])
  useEffect(() => { tryFlushPendingPresenceWarningRef.current = tryFlushPendingPresenceWarning }, [tryFlushPendingPresenceWarning])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { isCamOnRef.current = isCamOn }, [isCamOn])
  useEffect(() => { isAISpeakingRef.current = isAISpeaking }, [isAISpeaking])

  // Re-attach camera stream when video element remounts (e.g. cam toggle)
  useEffect(() => {
    if (isCamOn && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [isCamOn])

  // ── Continuous video presence monitoring (from interview start to end) ───────
  useEffect(() => {
    if (!readyToStart) return

    let cancelled = false

    ;(async () => {
      try {
        const monitor = await createPresenceMonitor({
          getVideoElement: () => videoRef.current,
          getCamOn: () => isCamOnRef.current,
          onWarning: () => {
            setPresenceWarning(true)
            if (aiAudioBusyRef.current || isAISpeakingRef.current) {
              pendingPresenceWarningAudioRef.current = true
              return
            }
            playPresenceWarningAudioRef.current?.()
          },
          onPresent: () => {
            setPresenceWarning(false)
            setPresenceSecondsLeft(0)
            pendingPresenceWarningAudioRef.current = false
            setStatusText("Listening...")
            if (aiAudioBusyRef.current || isAISpeakingRef.current) {
              pendingResumeListenRef.current = true
              return
            }
            resumeInterviewListenRef.current?.()
          },
          onTick: ({ phase, elapsedMs }) => {
            if (phase === "post_warn") {
              setPresenceSecondsLeft(
                Math.max(0, Math.ceil((PRESENCE_END_AFTER_WARN_MS - elapsedMs) / 1000))
              )
            } else {
              setPresenceSecondsLeft(0)
            }
          },
          onAbsentTooLong: () => {
            if (presenceEndedRef.current) return
            presenceEndedRef.current = true
            interviewActiveRef.current = false
            pendingPresenceWarningAudioRef.current = false
            setPresenceWarning(false)
            clearAllTimers()
            stopListeningStream()
            stopAllAIAudio()
            stopPresenceMonitor(presenceMonitorRef.current)
            presenceMonitorRef.current = null

            const finishEnd = () => handleEndInterviewRef.current?.()
            playInterviewerSpeechRef.current?.(
              "I haven't been able to see you in the frame. Let's wrap up here — please check your camera and try again.",
              {
                voice: sessionRef.current?.interviewer?.voice,
                context: "encouragement",
                bypassActiveCheck: true,
                skipFlushPending: true,
                onComplete: finishEnd,
              }
            )
            // Safety net if wrap-up audio fails or is blocked
            setTimeout(finishEnd, 12000)
          },
        })
        if (cancelled) monitor.stop()
        else presenceMonitorRef.current = monitor
      } catch (err) {
        console.warn("Presence monitor failed to start:", err)
      }
    })()

    return () => {
      cancelled = true
      stopPresenceMonitor(presenceMonitorRef.current)
      presenceMonitorRef.current = null
    }
  }, [readyToStart, clearAllTimers, stopListeningStream, stopAllAIAudio])

  // ── Volume monitoring (visual meter only — speech uses Silero VAD) ────────
  const startVolumeMonitor = useCallback(() => {
    const tick = () => {
      if (!analyserRef.current) return

      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(data)
      const fullAvg = Math.round(data.reduce((a, b) => a + b, 0) / data.length)
      setAudioLevel(fullAvg)

      volumeFrameRef.current = requestAnimationFrame(tick)
    }
    volumeFrameRef.current = requestAnimationFrame(tick)
  }, [])

  // ── Silero neural VAD on the recording stream ─────────────────────────────
  const attachSileroVad = useCallback(async (stream) => {
    stopSpeechVad(sileroVadRef.current)
    sileroVadRef.current = null

    try {
      sileroVadRef.current = await createSpeechVad({
        stream,
        onSpeechStart: () => {
          const phase = listenPhaseRef.current

          if (phase === "countdown" && !hasSpeechRef.current) {
            hasSpeechRef.current = true
            clearInterval(countdownIntervalRef.current)
            setPhase("speaking")
            setStatusText("Recording your answer...")
          }

          if (phase === "speaking") {
            clearTimeout(silenceAfterSpeechRef.current)
          }
        },
        onSpeechEnd: () => {
          if (listenPhaseRef.current !== "speaking") return
          clearTimeout(silenceAfterSpeechRef.current)
          silenceAfterSpeechRef.current = setTimeout(() => {
            if (listenPhaseRef.current === "speaking") {
              autoSubmitRef.current?.()
            }
          }, SILENCE_AFTER_SPEECH_MS)
        },
      })
    } catch (err) {
      console.warn("Silero VAD failed to start — silence timers will still run:", err)
    }
  }, [setPhase])

  // ── Camera + analyser init ─────────────────────────────────────────────────
  useEffect(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          streamRef.current = stream
          trackInterviewStream(stream)
          if (videoRef.current) videoRef.current.srcObject = stream

          // Build analyser from the camera stream's audio tracks
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const source = ctx.createMediaStreamSource(stream)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            audioContextRef.current = ctx
            analyserRef.current = analyser
            startVolumeMonitor()
          } catch {}
        })
        .catch(() => {})
    }
    return () => {
      releaseAllMedia()
    }
  // releaseAllMedia only used for unmount cleanup — omit from deps to avoid spurious teardown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startVolumeMonitor])

  // ── Session load ───────────────────────────────────────────────────────────
  useEffect(() => {
    const data =
      location.state?.sessionData ||
      JSON.parse(localStorage.getItem("interviewSession") || "null")

    if (!data?.sessionId) {
      navigate("/interview", { replace: true })
      return
    }

    setSession(data)
    setTotalQuestions(data.totalQuestions || 10)

    const first = data.firstQuestion
    if (first?.question) {
      // Dedup by numeric question ID only — text-based dedup caused false endings
      // because different questions can share similar wording (fallback bank wraps at 10).
      const firstId = first.question.id ?? 1
      usedQuestionIdsRef.current.add(firstId)

      setCurrentQuestion(first.question)
      setQuestionNumber(first.question.id || 1)
      setDisplayedText(first.question.text || "")

      // Store first audio URL — play it only after user clicks "Ready"
      // (browsers block autoplay without a user gesture on the current page)
      pendingFirstAudioRef.current = first.question.audio_url || null
    } else {
      setDisplayedText("Tell me about yourself.")
      pendingFirstAudioRef.current = null
    }
    // Show the Ready overlay — audio fires on click, not here
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle "Ready" click — unlocks audio and starts the interview ───────────
  const handleReady = useCallback(() => {
    interviewActiveRef.current = true
    presenceEndedRef.current = false
    presenceEndNavigatedRef.current = false
    pendingPresenceWarningAudioRef.current = false
    setReadyToStart(true)
    if (pendingFirstAudioRef.current) {
      playAudioQueue([{ url: pendingFirstAudioRef.current, label: "question" }])
    } else {
      // No TTS audio generated — speak the question via browser SpeechSynthesis
      // so the candidate always hears something before auto-listen begins.
      const text = displayedText || "Tell me about yourself."
      playInterviewerSpeech(text, {
        voice: session?.interviewer?.voice,
        context: "question",
        onComplete: () => startListeningModeRef.current?.(),
      })
    }
  }, [playAudioQueue, displayedText, playInterviewerSpeech, session])

  // ── Core: start listening mode ─────────────────────────────────────────────
  const startListeningMode = useCallback(async () => {
    if (!interviewActiveRef.current) return
    if (!isMicOn) {
      setStatusText("Microphone is off — turn it on to answer")
      return
    }

    clearAllTimers()
    hasSpeechRef.current = false
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      listeningStreamRef.current = stream
      trackInterviewStream(stream)

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()
      await attachSileroVad(stream)

      setPhase("countdown")
      setCountdownValue(FIRST_COUNTDOWN_S)
      setStatusText("Listening...")
      setError("")

      // Countdown — when it hits 0, auto-rephrase the question
      let remaining = FIRST_COUNTDOWN_S
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1
        setCountdownValue(remaining)
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current)
          handleFirstSilenceTimeoutRef.current?.()
        }
      }, 1000)
    } catch {
      setError("Could not access microphone. Please check permissions.")
    }
  }, [isMicOn, clearAllTimers, setPhase, attachSileroVad])

  // Keep ref current so audio queue end handler can call it.
  // startListeningDefaultRef mirrors the base (non-second-chance) version so
  // autoSubmitRecording can reset back to it after a repeat attempt without
  // needing startListeningMode in its own closure deps.
  const startListeningDefaultRef = useRef(null)
  useEffect(() => {
    startListeningModeRef.current = startListeningMode
    startListeningDefaultRef.current = startListeningMode
  }, [startListeningMode])
  useEffect(() => { waitingForFollowUpRef.current = waitingForFollowUp }, [waitingForFollowUp])

  // ── Core: auto-submit recording ────────────────────────────────────────────
  const autoSubmitRecording = useCallback(async () => {
    if (!interviewActiveRef.current) return
    clearAllTimers()
    setPhase("processing")
    stopListeningStream()

    await new Promise((r) => setTimeout(r, 200))

    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
    const durationSeconds = blob.size / 16000

    if (blob.size < 800) {
      setPhase("idle")
      setError("No speech detected. Please try again.")
      startListeningModeRef.current?.()
      return
    }

    setIsProcessing(true)
    setStatusText("Transcribing...")

    let transcript = ""
    try {
      const res = await apiTranscribe(blob)
      transcript = res.transcript || ""
    } catch {
      transcript = "[Audio transcription failed]"
    }

    if (!transcript.trim()) {
      setIsProcessing(false)
      setPhase("idle")
      setError("Couldn't detect speech. Please try again.")
      startListeningModeRef.current?.()
      return
    }

    // ── Meta-request detection ───────────────────────────────────────────────
    // If the user said something like "could you repeat the question?" instead
    // of actually answering, route to the repeat handler instead of submitting.
    // Word-count guard (< 15) avoids mis-routing real answers that happen to
    // contain one of these phrases in the middle of a longer response.
    const wordCount = transcript.trim().split(/\s+/).length
    if (REPEAT_REQUEST_REGEX.test(transcript) && wordCount < 15) {
      setIsProcessing(false)
      setPhase("idle")
      handleRepeatQuestionRef.current?.()
      return
    }

    setError("")
    setStatusText("Getting AI response...")

    try {
      const isFollowUp = waitingForFollowUpRef.current

      // Ensure questionText is never empty — an empty string causes a 422
      const questionText =
        (currentQuestion?.text || displayedText || "").trim() || "General interview question"

      const interviewerVoice = session.interviewer?.voice || "alloy"

      const resp = isFollowUp
        ? await apiSubmitFollowup({
            sessionId: session.sessionId,
            originalQuestionId: currentQuestion?.id || questionNumber,
            originalQuestionText: questionText,
            originalQuestionIntent: currentQuestion?.intent || "behavioral",
            followUpAnswer: transcript,
            role: session.role,
            difficulty: session.difficulty,
            totalQuestions,
            generateAudio: true,
            voice: interviewerVoice,
          })
        : await apiSubmitAnswerRealtime({
            sessionId: session.sessionId,
            questionId: currentQuestion?.id || questionNumber,
            questionText,
            questionIntent: currentQuestion?.intent || "behavioral",
            role: session.role,
            userAnswer: transcript,
            transcriptRaw: transcript,
            audioDurationSeconds: durationSeconds,
            difficulty: session.difficulty,
            totalQuestions,
            generateAudio: true,
            voice: interviewerVoice,
          })

      if (!interviewActiveRef.current) return

      // Persist answered question for feedback page
      const stored = JSON.parse(localStorage.getItem("interviewSession") || "{}")
      const answeredQuestions = stored.answeredQuestions || []
      const isFollowUpAnswer = waitingForFollowUpRef.current
      const flowControl = resp?.flow_control || {}
      const qMetrics = resp?.quality_metrics || {}
      const wordCount = transcript.trim().split(/\s+/).length
      // Derive a human-readable quality label from backend quality_metrics.
      // overall_quality comes from realtime_response_generator analyse step.
      // Word count guard catches one-liner answers that slip past structural checks.
      const backendQuality = qMetrics.overall_quality || "adequate"
      let qualityLabel
      if (wordCount < 10) {
        qualityLabel = "Weak One-Liner"
      } else if (backendQuality === "excellent") {
        qualityLabel = "Strong Response"
      } else if (backendQuality === "good") {
        qualityLabel = flowControl.needs_follow_up ? "Good — Needs Elaboration" : "Strong Response"
      } else if (backendQuality === "adequate") {
        qualityLabel = flowControl.needs_follow_up ? "Vague / Needs Elaboration" : "Adequate Response"
      } else {
        qualityLabel = flowControl.needs_follow_up ? "Missing Key Elements" : "Weak Response"
      }
      answeredQuestions.push({
        id: currentQuestion?.id || questionNumber,
        prompt: currentQuestion?.text || displayedText,
        interviewer: "AI Interviewer",
        type: currentQuestion?.type || "behavioral",
        userAnswer: transcript,
        idealAnswer: null,
        isFollowUp: isFollowUpAnswer,
        qualityLabel,
      })
      stored.answeredQuestions = answeredQuestions
      localStorage.setItem("interviewSession", JSON.stringify(stored))

      // Update stats
      const metadata = resp.next_question?.metadata || {}
      setStats((prev) => ({
        topics: metadata.topics_count || prev.topics + 1,
        connections: metadata.connections || prev.connections,
        patterns: metadata.patterns_detected || prev.patterns,
      }))

      // Reset repeat state and restore base listening mode for next question.
      repeatAttemptRef.current = false
      startListeningModeRef.current = startListeningDefaultRef.current
      consecutiveSilentSkipsRef.current = 0

      // ── Flow control ────────────────────────────────────────────────────
      const nextQuestion = resp.next_question

      if (flowControl.needs_follow_up && !isFollowUp) {
        setWaitingForFollowUp(true)
        waitingForFollowUpRef.current = true
        const probeText = resp.ai_response?.follow_up_probe?.text || "Could you elaborate on that?"
        setFollowUpProbeText(probeText)

        const queue = buildAudioQueue(resp.ai_response, null, true)
        if (queue.length > 0) {
          playAudioQueue(queue) // listening auto-starts when audio ends
        } else {
          setPhase("idle")
          startListeningModeRef.current?.()
        }
      } else {
        setWaitingForFollowUp(false)
        waitingForFollowUpRef.current = false
        setFollowUpProbeText("")

        if (nextQuestion?.question) {
          const nq = nextQuestion.question

          // Dedup by numeric ID only. The backend sets id = current_question_number
          // which is always monotonically increasing, so repeated text across
          // different question slots will never cause a false interview end.
          const qid = nq.id ?? (questionNumber + 1)
          if (usedQuestionIdsRef.current.has(qid)) {
            handleEndInterviewRef.current?.()
            return
          }
          usedQuestionIdsRef.current.add(qid)

          setCurrentQuestion(nq)
          setQuestionNumber(qid)
          setDisplayedText(nq.text || "")

          const queue = buildAudioQueue(resp.ai_response, nextQuestion, false)
          if (queue.length > 0) {
            playAudioQueue(queue) // listening auto-starts when audio ends
          } else {
            setPhase("idle")
            startListeningModeRef.current?.()
          }
        } else {
          handleEndInterviewRef.current?.()
        }
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer. Please try again.")
      setPhase("idle")
      startListeningModeRef.current?.()
    } finally {
      setIsProcessing(false)
    }
  }, [
    session, currentQuestion, questionNumber, displayedText,
    totalQuestions, clearAllTimers, stopListeningStream, setPhase, playAudioQueue,
  ])

  useEffect(() => { autoSubmitRef.current = autoSubmitRecording }, [autoSubmitRecording])

  // ── LLM rephrase + interviewer TTS — show rephrased text on screen ─────────
  const speakRephrasedQuestion = useCallback(async (onComplete) => {
    if (!interviewActiveRef.current) return
    const questionText = (currentQuestion?.text || displayedText || "").trim()
    if (!questionText || !session?.role) {
      onComplete?.()
      return
    }

    setIsProcessing(true)
    setStatusText("Processing…")

    try {
      const result = await apiRephraseQuestion({
        questionText,
        role: session.role,
        generateAudio: true,
        voice: session.interviewer?.voice,
      })
      if (!interviewActiveRef.current) return

      const rephrased = result.rephrased_text?.trim() || questionText
      setDisplayedText(rephrased)
      setCurrentQuestion((prev) => (prev ? { ...prev, text: rephrased } : prev))

      if (result.audio_url) {
        setIsProcessing(false)
        playAudioQueue([{ url: result.audio_url, label: "question" }])
      } else {
        setIsProcessing(false)
        await playInterviewerSpeech(rephrased, {
          voice: session.interviewer?.voice,
          context: "question",
          onComplete,
        })
      }
    } catch {
      setIsProcessing(false)
      setError("Could not rephrase the question — please listen and try again.")
      await playInterviewerSpeech(questionText, {
        voice: session.interviewer?.voice,
        context: "question",
        onComplete,
      })
    }
  }, [session, currentQuestion, displayedText, playAudioQueue, playInterviewerSpeech])

  // ── First silence timeout (12s) → auto-rephrase and re-ask ────────────────
  const handleFirstSilenceTimeout = useCallback(async () => {
    if (!interviewActiveRef.current) return
    stopListeningStream()
    audioChunksRef.current = []
    repeatAttemptRef.current = true
    startListeningModeRef.current = startListeningSecondChanceRef.current

    await speakRephrasedQuestion(() => startListeningSecondChanceRef.current?.())
  }, [stopListeningStream, speakRephrasedQuestion])

  const handleFirstSilenceTimeoutRef = useRef(handleFirstSilenceTimeout)
  useEffect(() => { handleFirstSilenceTimeoutRef.current = handleFirstSilenceTimeout }, [handleFirstSilenceTimeout])

  // ── User asked to repeat mid-answer → paraphrase and second listen ────────
  const handleRepeatQuestion = useCallback(async () => {
    repeatAttemptRef.current = true
    hasSpeechRef.current = false
    startListeningModeRef.current = startListeningSecondChanceRef.current

    await speakRephrasedQuestion(() => startListeningSecondChanceRef.current?.())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakRephrasedQuestion])

  const handleRepeatQuestionRef = useRef(handleRepeatQuestion)
  useEffect(() => { handleRepeatQuestionRef.current = handleRepeatQuestion }, [handleRepeatQuestion])

  // ── Second listening attempt (after rephrase) ─────────────────────────────
  // Same 12s window; silence → motivational message → skip to next question
  const startListeningModeWithSecondChance = useCallback(async () => {
    if (!interviewActiveRef.current) return
    if (!isMicOn) return
    clearAllTimers()
    hasSpeechRef.current = false
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      listeningStreamRef.current = stream
      trackInterviewStream(stream)

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()
      await attachSileroVad(stream)

      setPhase("countdown")
      setCountdownValue(FIRST_COUNTDOWN_S)
      setStatusText("Listening…")

      let remaining = FIRST_COUNTDOWN_S
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1
        setCountdownValue(remaining)
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current)
          // Second time stuck → motivational message
          handleSecondSilenceTimeoutRef.current?.()
        }
      }, 1000)
    } catch {
      setError("Could not access microphone.")
    }
  }, [isMicOn, clearAllTimers, setPhase, attachSileroVad])

  useEffect(() => {
    startListeningSecondChanceRef.current = startListeningModeWithSecondChance
  }, [startListeningModeWithSecondChance])

  // ── Second silence timeout → encouragement, then next question ─────────────
  const handleSecondSilenceTimeout = useCallback(async () => {
    if (!interviewActiveRef.current) return
    stopListeningStream()
    audioChunksRef.current = []
    repeatAttemptRef.current = false
    startListeningModeRef.current = startListeningDefaultRef.current

    const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)]
    setPhase("idle")

    await playInterviewerSpeech(msg, {
      voice: session?.interviewer?.voice,
      context: "encouragement",
      onComplete: () => handleSkipToNextRef.current?.(),
    })
  }, [stopListeningStream, setPhase, playInterviewerSpeech, session])

  const handleSecondSilenceTimeoutRef = useRef(handleSecondSilenceTimeout)
  useEffect(() => { handleSecondSilenceTimeoutRef.current = handleSecondSilenceTimeout }, [handleSecondSilenceTimeout])

  // ── Skip to next question (after silent timeout) ───────────────────────────
  const handleSkipToNext = useCallback(async () => {
    if (!interviewActiveRef.current) return
    clearAllTimers()
    setPhase("processing")
    setIsProcessing(true)
    repeatAttemptRef.current = false
    startListeningModeRef.current = startListeningMode

    consecutiveSilentSkipsRef.current += 1
    if (consecutiveSilentSkipsRef.current >= MAX_CONSECUTIVE_SILENT_SKIPS) {
      interviewActiveRef.current = false
      setIsProcessing(false)
      setPhase("idle")
      stopAllAIAudio()
      await playInterviewerSpeech(
        "It looks like we're having trouble hearing you. Let's wrap up here.",
        {
          voice: session?.interviewer?.voice,
          context: "encouragement",
          bypassActiveCheck: true,
          skipFlushPending: true,
          onComplete: () => handleEndInterviewRef.current?.(),
        }
      )
      return
    }

    const applyNextQuestion = (nextQuestion, aiResponse) => {
      if (!interviewActiveRef.current) return false
      if (!nextQuestion?.question) return false

      const nq = nextQuestion.question
      const qid = nq.id ?? (questionNumber + 1)
      if (usedQuestionIdsRef.current.has(qid)) {
        handleEndInterviewRef.current?.()
        return true
      }
      usedQuestionIdsRef.current.add(qid)

      setCurrentQuestion(nq)
      setQuestionNumber(qid)
      setDisplayedText(nq.text || "")
      setWaitingForFollowUp(false)
      waitingForFollowUpRef.current = false
      setFollowUpProbeText("")

      const queue = buildAudioQueue(aiResponse, nextQuestion, false)
      if (queue.length > 0) {
        playAudioQueue(queue)
      } else {
        setPhase("idle")
        playInterviewerSpeech(nq.text || "", {
          voice: session?.interviewer?.voice,
          context: "question",
          onComplete: () => startListeningModeRef.current?.(),
        })
      }
      return true
    }

    try {
      const storedSkip = JSON.parse(localStorage.getItem("interviewSession") || "{}")
      const answeredSkip = storedSkip.answeredQuestions || []
      answeredSkip.push({
        id: currentQuestion?.id || questionNumber,
        prompt: currentQuestion?.text || displayedText,
        interviewer: "AI Interviewer",
        type: currentQuestion?.type || "behavioral",
        userAnswer: "[No response — candidate skipped]",
        idealAnswer: null,
        isFollowUp: false,
        qualityLabel: "Silent Response",
      })
      storedSkip.answeredQuestions = answeredSkip
      localStorage.setItem("interviewSession", JSON.stringify(storedSkip))

      const resp = await apiSubmitAnswerRealtime({
        sessionId: session.sessionId,
        questionId: currentQuestion?.id || questionNumber,
        questionText: currentQuestion?.text || displayedText,
        questionIntent: currentQuestion?.intent || "behavioral",
        role: session.role,
        userAnswer: "[No response — candidate skipped]",
        transcriptRaw: "[skipped]",
        audioDurationSeconds: 0,
        difficulty: session.difficulty,
        totalQuestions,
        generateAudio: true,
        voice: session.interviewer?.voice,
      })

      if (!interviewActiveRef.current) return

      if (applyNextQuestion(resp.next_question, resp.ai_response)) return

      // Backend did not return next question — fetch it directly as fallback
      const nextNum = (currentQuestion?.id || questionNumber) + 1
      if (nextNum > totalQuestions) {
        handleEndInterviewRef.current?.()
        return
      }

      const fallback = await apiGetNextQuestion({
        sessionId: session.sessionId,
        currentQuestionNumber: nextNum,
        role: session.role,
        difficulty: session.difficulty,
        totalQuestions,
      })

      if (!interviewActiveRef.current) return

      applyNextQuestion(
        { question: fallback.question, interviewer_comment: fallback.interviewer_comment },
        resp.ai_response
      )
    } catch (err) {
      setError(err.message || "Failed to load the next question. Please try again.")
      setPhase("idle")
    } finally {
      setIsProcessing(false)
    }
  }, [
    session, currentQuestion, questionNumber, displayedText,
    totalQuestions, clearAllTimers, setPhase, playAudioQueue, startListeningMode, playInterviewerSpeech, stopAllAIAudio,
  ])

  useEffect(() => { handleSkipToNextRef.current = handleSkipToNext }, [handleSkipToNext])

  // ── Repeat question (manual button) ───────────────────────────────────────
  const handleRepeatQuestionAudio = () => {
    if (currentQuestion?.audio_url) {
      clearAllTimers()
      stopListeningStream()
      setPhase("idle")
      playAudioQueue([{ url: currentQuestion.audio_url, label: "question" }])
    }
  }

  // ── End interview ──────────────────────────────────────────────────────────
  const handleEndInterview = useCallback(() => {
    if (presenceEndNavigatedRef.current) return
    presenceEndNavigatedRef.current = true
    interviewActiveRef.current = false
    presenceEndedRef.current = true
    pendingPresenceWarningAudioRef.current = false
    clearAllTimers()
    stopListeningStream()
    stopAllAIAudio()
    stopPresenceMonitor(presenceMonitorRef.current)
    presenceMonitorRef.current = null
    navigate("/feedback")
  }, [clearAllTimers, stopListeningStream, stopAllAIAudio, navigate])

  const handleEndInterviewRef = useRef(handleEndInterview)
  useEffect(() => { handleEndInterviewRef.current = handleEndInterview }, [handleEndInterview])

  // ── Derived UI values ──────────────────────────────────────────────────────
  const progressPercent = Math.round((questionNumber / totalQuestions) * 100)
  const stage = questionNumber <= 3 ? "Early" : questionNumber <= 7 ? "Mid" : "Late"

  // Countdown ring for SVG circle (r=18, circumference ≈ 113)
  const RING_CIRC = 113
  const maxCountdown = FIRST_COUNTDOWN_S
  const ringOffset = RING_CIRC - (RING_CIRC * countdownValue) / maxCountdown

  // Audio level bars (5 bars)
  const bars = Array.from({ length: 5 }, (_, i) => {
    const threshold = (i + 1) * (255 / 6)
    return audioLevel > threshold
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">

      {/* ── Audio-unlock overlay — shown until user clicks Ready ── */}
      {!readyToStart && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 text-center px-8 max-w-sm">
            {/* Orb preview */}
            <div className="relative w-24 h-24">
              <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-2xl" />
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400/80 to-teal-600 shadow-[0_0_40px_rgba(34,211,238,0.4)]" />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Ready to begin?</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your interviewer will ask you questions out loud.<br />
                Answer naturally — recording starts automatically.
              </p>
            </div>

            {displayedText && (
              <div className="w-full rounded-xl bg-card border border-border px-4 py-3 text-left">
                <p className="text-xs text-muted-foreground mb-1">First question:</p>
                <p className="text-sm text-foreground italic">"{displayedText}"</p>
              </div>
            )}

            <button
              onClick={handleReady}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
            >
              Start Interview →
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex-shrink-0 bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-foreground font-medium">Q{questionNumber}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">{totalQuestions}</span>
            </div>
            <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-muted-foreground text-sm">Stage: {stage}</span>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-primary text-xl font-bold">{stats.topics}</div>
              <div className="text-muted-foreground text-xs">Topics</div>
            </div>
            <div className="text-center">
              <div className="text-primary text-xl font-bold">{stats.connections}</div>
              <div className="text-muted-foreground text-xs">Connections</div>
            </div>
            <div className="text-center">
              <div className="text-primary text-xl font-bold">{stats.patterns}</div>
              <div className="text-muted-foreground text-xs">Patterns</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex p-6 gap-6">

        {/* Left: User Camera */}
        <div className="w-80 flex flex-col">
          <div className={cn(
            "relative bg-card rounded-2xl overflow-hidden border flex-1",
            presenceWarning ? "border-amber-500 border-2" : "border-border"
          )}>
            <div className="absolute top-4 left-4 z-10 flex gap-2">
              <button
                onClick={() => setIsMicOn(!isMicOn)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  isMicOn ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                Mic
              </button>
              <button
                onClick={() => setIsCamOn(!isCamOn)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  isCamOn ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                )}
              >
                Cam
              </button>
            </div>

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cn(
                "w-full h-full object-cover scale-x-[-1]",
                !isCamOn && "hidden"
              )}
            />
            {!isCamOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/30">
                <span className="text-muted-foreground text-sm">Camera Off</span>
              </div>
            )}

            {/* Presence — 3s warn, then 10s countdown → end (13s total if still absent) */}
            {readyToStart && presenceWarning && (
              <div className="absolute inset-x-0 bottom-0 z-20 bg-amber-500/95 text-amber-950 px-3 py-3 text-center">
                <p className="text-xs font-semibold">
                  Please turn on your camera and stay in frame
                </p>
                {presenceSecondsLeft > 0 && (
                  <p className="text-[11px] mt-1 opacity-90">
                    Interview will end in {presenceSecondsLeft}s
                  </p>
                )}
              </div>
            )}

            {/* Live monitoring indicator */}
            {readyToStart && !presenceWarning && isCamOn && (
              <div className="absolute top-14 left-4 z-10 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 text-[10px] text-white/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Monitoring
              </div>
            )}

            {/* Mic activity indicator in camera panel */}
            {listenPhase === "speaking" && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1">
                {bars.map((active, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 rounded-full transition-all duration-75",
                      active ? "bg-red-400" : "bg-secondary"
                    )}
                    style={{ height: `${(i + 1) * 6}px` }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Orb Area */}
        <div className="flex-1 relative bg-background rounded-2xl overflow-hidden border border-border">
          <div className="absolute top-4 right-4 z-10">
            <span className="px-4 py-2 rounded-full bg-secondary text-foreground text-sm font-medium border border-border">
              AI Interviewer
            </span>
          </div>

          {/* Glowing Orb */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "absolute w-64 h-64 rounded-full transition-all duration-500",
              isAISpeaking ? "bg-cyan-400/20 blur-3xl scale-110" : "bg-cyan-400/10 blur-2xl scale-100"
            )} />
            <div className={cn(
              "absolute w-40 h-40 rounded-full transition-all duration-300",
              isAISpeaking ? "bg-cyan-400/40 blur-2xl" : "bg-cyan-400/20 blur-xl"
            )} />
            <div
              className={cn(
                "relative w-24 h-24 rounded-full transition-all duration-200",
                isAISpeaking
                  ? "bg-gradient-to-br from-cyan-400 to-teal-500 shadow-[0_0_60px_rgba(34,211,238,0.6)]"
                  : "bg-gradient-to-br from-cyan-400/80 to-teal-600 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
              )}
              style={{ animation: isAISpeaking ? "orbPulse 1.5s ease-in-out infinite" : "none" }}
            />
          </div>

          {/* AI status text — sits just below the orb, always visible */}
          <div className="absolute top-[58%] left-1/2 -translate-x-1/2 text-center">
            <span className="text-muted-foreground text-sm">
              {isAISpeaking
                ? "AI is speaking…"
                : isProcessing
                  ? "Processing…"
                  : listenPhase === "countdown" || listenPhase === "speaking"
                    ? "Listening…"
                    : ""}
            </span>
          </div>

          {/* Status banners — pinned to bottom of orb area, above the transcript bar */}
          <div className="absolute bottom-5 left-0 right-0 px-6 space-y-2">

            {/* Follow-up probe text */}
            {waitingForFollowUp && followUpProbeText && (
              <div className="rounded-xl bg-primary/10 border border-primary/30 px-4 py-3 text-sm text-primary text-center">
                {followUpProbeText}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Transcript + Controls */}
      <div className="flex-shrink-0 bg-background border-t border-border px-6 py-5">

        {error && (
          <div className="mb-3 rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        {/* Question transcript */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground text-sm">
              {waitingForFollowUp ? "Follow-up" : "AI Question"}
            </span>
          </div>
          <p className="text-foreground text-lg italic leading-relaxed min-h-[3rem]">
            &ldquo;{displayedText}&rdquo;
            {isAISpeaking && (
              <span className="inline-block w-0.5 h-5 bg-primary ml-1 animate-pulse" />
            )}
          </p>
        </div>

        {/* Control bar */}
        <div className="flex items-center justify-between">

          {/* Left: spacer (Repeat button removed — voice "want a repeat?" handles it) */}
          <div className="w-28" />

          {/* Center: Listen status widget */}
          <div className="flex items-center gap-4">

            {/* AI speaking */}
            {isAISpeaking && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-primary text-sm font-medium">AI is speaking…</span>
              </div>
            )}

            {/* Processing spinner */}
            {isProcessing && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-primary text-sm">{statusText}</span>
              </div>
            )}

            {/* Countdown ring — waiting for first word */}
            {(listenPhase === "countdown") && !isProcessing && (
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor"
                      strokeWidth="3" className="text-secondary" />
                    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round"
                      className="text-primary"
                      style={{
                        strokeDasharray: RING_CIRC,
                        strokeDashoffset: ringOffset,
                        transition: "stroke-dashoffset 1s linear",
                      }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                    {countdownValue}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-foreground text-sm font-medium">Listening…</span>
                  <span className="text-muted-foreground text-xs">
                    Start speaking whenever you&apos;re ready
                  </span>
                </div>
              </div>
            )}

            {/* Active recording indicator */}
            {listenPhase === "speaking" && !isProcessing && (
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <div className="flex items-end gap-0.5">
                  {bars.map((active, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-1.5 rounded-sm transition-all duration-75",
                        active ? "bg-red-400" : "bg-secondary"
                      )}
                      style={{ height: `${8 + (i + 1) * 4}px` }}
                    />
                  ))}
                </div>
                <span className="text-red-400 text-sm font-medium">Recording…</span>
                <span className="text-muted-foreground text-xs">
                  Will auto-submit when you stop
                </span>
              </div>
            )}

            {/* Idle fallback */}
            {listenPhase === "idle" && !isAISpeaking && !isProcessing && presenceWarning && (
              <span className="text-amber-400 text-sm font-medium">
                {presenceSecondsLeft > 0
                  ? `Out of frame — interview ends in ${presenceSecondsLeft}s`
                  : "Please return to the camera frame"}
              </span>
            )}
            {listenPhase === "idle" && !isAISpeaking && !isProcessing && !presenceWarning && (
              <span className="text-muted-foreground text-sm">Preparing…</span>
            )}
          </div>

          {/* Right: End Interview */}
          <Button
            onClick={handleEndInterview}
            className="rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground h-11 px-5"
          >
            End Interview
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
