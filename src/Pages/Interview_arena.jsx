import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiTranscribe, apiSubmitAnswerRealtime, apiSubmitFollowup } from "@/api/client"

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
// Voice Activity Detection (VAD) constants
// Human speech sits mostly in the 80–3 000 Hz range.
// With fftSize=256 and a typical 44.1 kHz sample rate,
// each bin covers ~172 Hz, so bins 1–17 cover ~172–3 000 Hz.
// We compute a weighted average of those mid-range bins instead of a flat
// whole-spectrum average, which filters out low-frequency table/keyboard thuds
// and high-frequency hiss that would otherwise trigger recording.
const SPEECH_THRESHOLD = 22    // weighted mid-band energy above this = probable voice
const SPEECH_CONFIRM_FRAMES = 6 // must be sustained for 6 consecutive frames (~100ms at 60fps)
const VOICE_BIN_START = 1      // ~172 Hz
const VOICE_BIN_END = 17       // ~3 000 Hz
const SILENCE_AFTER_SPEECH_MS = 5000   // auto-submit after this many ms of silence
const FIRST_COUNTDOWN_S = 20   // seconds before "want a repeat?"
const REPEAT_LISTEN_S = 8    // seconds to listen for yes/no
const SKIP_COUNTDOWN_S = 10   // seconds before skipping after "no"

// Natural yes/no intent detection — covers common phrasings
const YES_REGEX =
  /\b(yes|yeah|yep|please|repeat|again|say that|come again|sorry|pardon|could you|what did|what was|huh|i didn.?t|didn.?t catch|missed that)\b/i
const NO_REGEX =
  /\b(no|nope|never ?mind|skip|next|proceed|move on|that.?s ok|that.?s fine|pass|continue|i.?m good|carry on)\b/i

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

  // Timer refs
  const countdownIntervalRef = useRef(null)
  const silenceAfterSpeechRef = useRef(null)
  const skipIntervalRef = useRef(null)

  // State mirrors (readable inside rAF / setTimeout without stale closures)
  const listenPhaseRef = useRef("idle")
  const hasSpeechRef = useRef(false)
  const repeatAttemptRef = useRef(false)
  const waitingForFollowUpRef = useRef(false)
  // Counts consecutive FFT frames above SPEECH_THRESHOLD — prevents noise spikes
  // from being mistaken for speech. Reset to 0 whenever a frame is below threshold.
  const consecutiveSpeechFramesRef = useRef(0)

  // Callback refs — always point at the latest version of the function
  const autoSubmitRef = useRef(null)
  const submitRepeatResponseRef = useRef(null)
  const startListeningModeRef = useRef(null)

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

  // ── Follow-up state ────────────────────────────────────────────────────────
  const [waitingForFollowUp, setWaitingForFollowUp] = useState(false)
  const [followUpProbeText, setFollowUpProbeText] = useState("")

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState({ topics: 0, connections: 0, patterns: 0 })

  // ── Audio playback — imperative ref-based (no state machine) ──────────────
  // activePlayIdRef: incremented each time a new queue starts.
  // Each play-loop captures its own id; if id changes it knows it was cancelled.
  const activePlayIdRef = useRef(0)

  // ── Listen-mode state ──────────────────────────────────────────────────────
  // Phases:
  //   idle            → not listening (AI is speaking or processing)
  //   countdown       → waiting for user to start speaking (20s timer)
  //   speaking        → user detected, recording in progress
  //   processing      → transcribing + submitting to backend
  //   repeat_prompt   → AI is asking "want a repeat?"
  //   repeat_countdown→ listening for user's yes/no response (8s)
  //   repeat_speaking → user detected during yes/no phase
  //   second_countdown→ 10s wait before skipping to next question
  //   motivating      → playing encouragement message
  const [listenPhase, setListenPhase] = useState("idle")
  const [countdownValue, setCountdownValue] = useState(FIRST_COUNTDOWN_S)
  const [audioLevel, setAudioLevel] = useState(0)
  const [skipCountdownValue, setSkipCountdownValue] = useState(SKIP_COUNTDOWN_S)

  // Convenience: keep ref in sync with state
  const setPhase = useCallback((phase) => {
    listenPhaseRef.current = phase
    setListenPhase(phase)
  }, [])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const clearAllTimers = useCallback(() => {
    clearInterval(countdownIntervalRef.current)
    clearTimeout(silenceAfterSpeechRef.current)
    clearInterval(skipIntervalRef.current)
  }, [])

  const stopListeningStream = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      try { mediaRecorderRef.current.stop() } catch {}
    }
    listeningStreamRef.current?.getTracks().forEach((t) => t.stop())
    listeningStreamRef.current = null
  }, [])

  // ── Play audio queue — fully imperative, no React state sequencing ─────────
  // Why: the old useEffect approach had a bug where React's cleanup function
  // `return () => { audio.pause() }` fired between renders and cut audio short.
  // This version plays clips directly via a recursive callback — no state involved.
  const playAudioQueue = useCallback((queue) => {
    // Cancel any previous queue by bumping the play-id
    const myId = ++activePlayIdRef.current

    // Hard-stop whatever is currently playing
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }

    if (!queue || queue.length === 0) {
      setIsAISpeaking(false)
      setPhase("idle")
      startListeningModeRef.current?.()
      return
    }

    setIsAISpeaking(true)
    setPhase("idle")

    let index = 0

    const playNext = () => {
      // If a newer queue has started, stop this one
      if (activePlayIdRef.current !== myId) return

      if (index >= queue.length) {
        // All clips finished — start listening
        setIsAISpeaking(false)
        startListeningModeRef.current?.()
        return
      }

      const item = queue[index++]
      const audio = new Audio(item.url)
      audioRef.current = audio

      audio.onended = playNext
      audio.onerror = playNext   // skip broken / missing clips
      audio.play().catch(playNext) // skip if browser rejects (e.g. autoplay)
    }

    playNext()
  }, [setPhase])

  // ── Volume monitoring (Web Audio API) ─────────────────────────────────────
  const startVolumeMonitor = useCallback(() => {
    const tick = () => {
      if (!analyserRef.current) return

      const data = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(data)
      // Full-spectrum average for the visual level meter (all 128 bins)
      const fullAvg = Math.round(data.reduce((a, b) => a + b, 0) / data.length)
      setAudioLevel(fullAvg)
      // Voice-band energy: only bins covering ~80–3000 Hz for speech detection.
      // This rejects keyboard clicks (low-freq) and hiss/fan noise (high-freq).
      const voiceBins = data.slice(VOICE_BIN_START, VOICE_BIN_END + 1)
      const avg = Math.round(voiceBins.reduce((a, b) => a + b, 0) / voiceBins.length)

      const phase = listenPhaseRef.current

      // ── First listen window: countdown → speaking ──
      // Require SPEECH_CONFIRM_FRAMES consecutive frames above threshold to avoid
      // triggering on keyboard noise, background sounds, or brief spikes.
      if (phase === "countdown" && !hasSpeechRef.current) {
        if (avg > SPEECH_THRESHOLD) {
          consecutiveSpeechFramesRef.current += 1
          if (consecutiveSpeechFramesRef.current >= SPEECH_CONFIRM_FRAMES) {
            hasSpeechRef.current = true
            consecutiveSpeechFramesRef.current = 0
            clearInterval(countdownIntervalRef.current)
            listenPhaseRef.current = "speaking"
            setListenPhase("speaking")
            setStatusText("Recording your answer...")
          }
        } else {
          // Reset on any sub-threshold frame — must be sustained speech
          consecutiveSpeechFramesRef.current = 0
        }
      }

      if (phase === "speaking" && avg > SPEECH_THRESHOLD) {
        clearTimeout(silenceAfterSpeechRef.current)
        silenceAfterSpeechRef.current = setTimeout(() => {
          if (listenPhaseRef.current === "speaking") {
            autoSubmitRef.current?.()
          }
        }, SILENCE_AFTER_SPEECH_MS)
      }

      // ── Repeat-listen window: repeat_countdown → repeat_speaking ──
      if (phase === "repeat_countdown" && !hasSpeechRef.current) {
        if (avg > SPEECH_THRESHOLD) {
          consecutiveSpeechFramesRef.current += 1
          if (consecutiveSpeechFramesRef.current >= SPEECH_CONFIRM_FRAMES) {
            hasSpeechRef.current = true
            consecutiveSpeechFramesRef.current = 0
            clearInterval(countdownIntervalRef.current)
            listenPhaseRef.current = "repeat_speaking"
            setListenPhase("repeat_speaking")
          }
        } else {
          consecutiveSpeechFramesRef.current = 0
        }
      }

      if (phase === "repeat_speaking" && avg > SPEECH_THRESHOLD) {
        clearTimeout(silenceAfterSpeechRef.current)
        silenceAfterSpeechRef.current = setTimeout(() => {
          if (listenPhaseRef.current === "repeat_speaking") {
            submitRepeatResponseRef.current?.()
          }
        }, 2000)
      }

      volumeFrameRef.current = requestAnimationFrame(tick)
    }
    volumeFrameRef.current = requestAnimationFrame(tick)
  }, [])

  // ── Camera + analyser init ─────────────────────────────────────────────────
  useEffect(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          streamRef.current = stream
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
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      if (volumeFrameRef.current) cancelAnimationFrame(volumeFrameRef.current)
      audioContextRef.current?.close()
      audioContextRef.current = null
      analyserRef.current = null
    }
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
    setReadyToStart(true)
    if (pendingFirstAudioRef.current) {
      playAudioQueue([{ url: pendingFirstAudioRef.current, label: "question" }])
    } else {
      // No TTS audio generated — speak the question via browser SpeechSynthesis
      // so the candidate always hears something before auto-listen begins.
      const text = displayedText || "Tell me about yourself."
      speakText(text, () => startListeningModeRef.current?.())
    }
  }, [playAudioQueue, displayedText])

  // ── Core: start listening mode ─────────────────────────────────────────────
  const startListeningMode = useCallback(async () => {
    if (!isMicOn) {
      setStatusText("Microphone is off — turn it on to answer")
      return
    }

    clearAllTimers()
    hasSpeechRef.current = false
    consecutiveSpeechFramesRef.current = 0
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      listeningStreamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()

      setPhase("countdown")
      setCountdownValue(FIRST_COUNTDOWN_S)
      setStatusText("Listening...")
      setError("")

      // Countdown — when it hits 0, trigger repeat-prompt flow
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
  }, [isMicOn, clearAllTimers, setPhase])

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
      // handleRepeatQuestion sets startListeningModeRef → startListeningModeWithSecondChance;
      // we must restore it here so subsequent questions use the normal repeat-prompt flow.
      repeatAttemptRef.current = false
      startListeningModeRef.current = startListeningDefaultRef.current

      // ── Flow control ────────────────────────────────────────────────────
      const flowControl = resp.flow_control || {}
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

  // ── First silence timeout (20s no speech) → ask if user wants repeat ──────
  const handleFirstSilenceTimeout = useCallback(() => {
    stopListeningStream()
    audioChunksRef.current = []
    setPhase("repeat_prompt")
    setStatusText("Checking in with you...")

    speakText(
      "Do you want me to repeat the question?",
      () => startRepeatListeningRef.current?.()
    )
  }, [stopListeningStream, setPhase])

  const handleFirstSilenceTimeoutRef = useRef(handleFirstSilenceTimeout)
  useEffect(() => { handleFirstSilenceTimeoutRef.current = handleFirstSilenceTimeout }, [handleFirstSilenceTimeout])

  // ── Start listening for user's yes/no response ────────────────────────────
  const startRepeatListening = useCallback(async () => {
    hasSpeechRef.current = false
    consecutiveSpeechFramesRef.current = 0
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      listeningStreamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()

      setPhase("repeat_countdown")
      setCountdownValue(REPEAT_LISTEN_S)
      setStatusText("Say 'Yes' to repeat, or 'No' to continue…")

      let remaining = REPEAT_LISTEN_S
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1
        setCountdownValue(remaining)
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current)
          submitRepeatResponseRef.current?.()
        }
      }, 1000)
    } catch {
      // Mic error → just skip
      handleWaitThenSkipRef.current?.()
    }
  }, [setPhase])

  const startRepeatListeningRef = useRef(startRepeatListening)
  useEffect(() => { startRepeatListeningRef.current = startRepeatListening }, [startRepeatListening])

  // ── Submit yes/no response ─────────────────────────────────────────────────
  const submitRepeatResponse = useCallback(async () => {
    clearInterval(countdownIntervalRef.current)
    stopListeningStream()
    await new Promise((r) => setTimeout(r, 200))

    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })

    let transcript = ""
    if (blob.size > 400) {
      try {
        const res = await apiTranscribe(blob)
        transcript = res.transcript || ""
      } catch {}
    }

    const isYes = YES_REGEX.test(transcript)
    const isNo = NO_REGEX.test(transcript)

    if (isYes || (!isNo && transcript.trim())) {
      // Yes (or something unclear but the user said something — give benefit of doubt)
      handleRepeatQuestionRef.current?.()
    } else {
      // No / silence
      handleWaitThenSkipRef.current?.()
    }
  }, [stopListeningStream])

  useEffect(() => { submitRepeatResponseRef.current = submitRepeatResponse }, [submitRepeatResponse])

  // ── User said yes → replay question audio ─────────────────────────────────
  const handleRepeatQuestion = useCallback(() => {
    repeatAttemptRef.current = true
    // Reset voice detection state so the second-chance listen window starts clean.
    // Without this, stale frame counts from the yes/no listen phase can
    // immediately flip phase to "speaking" before the user has said a word.
    hasSpeechRef.current = false
    consecutiveSpeechFramesRef.current = 0
    // Synchronously override the queue-end handler so that when the replayed
    // audio finishes, auto-listen goes directly to startListeningModeWithSecondChance
    // (second silence → motivational) instead of back to startListeningMode
    // (which would restart the "want a repeat?" loop).
    startListeningModeRef.current = startListeningModeWithSecondChance
    setPhase("idle")

    if (currentQuestion?.audio_url) {
      playAudioQueue([{ url: currentQuestion.audio_url, label: "question" }])
    } else {
      // No audio cached — go straight to second listening attempt
      startListeningModeWithSecondChance()
    }
  // NOTE: startListeningModeWithSecondChance is intentionally omitted from deps.
  // It is declared AFTER this useCallback in the component, so including it in
  // the dep array would cause a TDZ ReferenceError. The closure body is safe
  // (lazy-evaluated). handleRepeatQuestionRef.current is always kept fresh so
  // callers always invoke the latest version.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, playAudioQueue, setPhase])

  const handleRepeatQuestionRef = useRef(handleRepeatQuestion)
  useEffect(() => { handleRepeatQuestionRef.current = handleRepeatQuestion }, [handleRepeatQuestion])

  // ── Second listening attempt (after repeat) ───────────────────────────────
  // Same as startListeningMode but timeout → motivating instead of repeat_prompt
  const startListeningModeWithSecondChance = useCallback(async () => {
    if (!isMicOn) return
    clearAllTimers()
    hasSpeechRef.current = false
    consecutiveSpeechFramesRef.current = 0
    audioChunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      listeningStreamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.start()

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
  }, [isMicOn, clearAllTimers, setPhase])

  // NOTE: startListeningModeRef is set synchronously in two places:
  //   • handleRepeatQuestion  → switches to startListeningModeWithSecondChance
  //   • autoSubmitRecording   → resets back to startListeningDefaultRef.current
  // The useEffect that previously tried to do this here was broken because it
  // read repeatAttemptRef.current (a ref) inside its condition — refs don't
  // trigger effect re-runs, so the override never fired. Removed.

  // ── Second silence timeout → motivational message ──────────────────────────
  const handleSecondSilenceTimeout = useCallback(() => {
    stopListeningStream()
    audioChunksRef.current = []
    repeatAttemptRef.current = false

    const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)]
    setPhase("motivating")
    setStatusText(msg)

    speakText(msg, () => {
      // After encouragement, wait then skip
      handleWaitThenSkipRef.current?.()
    })
  }, [stopListeningStream, setPhase])

  const handleSecondSilenceTimeoutRef = useRef(handleSecondSilenceTimeout)
  useEffect(() => { handleSecondSilenceTimeoutRef.current = handleSecondSilenceTimeout }, [handleSecondSilenceTimeout])

  // ── User said no / motivating done → 10s countdown then skip ─────────────
  const handleWaitThenSkip = useCallback(() => {
    setPhase("second_countdown")
    setSkipCountdownValue(SKIP_COUNTDOWN_S)

    let remaining = SKIP_COUNTDOWN_S
    skipIntervalRef.current = setInterval(() => {
      remaining -= 1
      setSkipCountdownValue(remaining)
      if (remaining <= 0) {
        clearInterval(skipIntervalRef.current)
        handleSkipToNextRef.current?.()
      }
    }, 1000)
  }, [setPhase])

  const handleWaitThenSkipRef = useRef(handleWaitThenSkip)
  useEffect(() => { handleWaitThenSkipRef.current = handleWaitThenSkip }, [handleWaitThenSkip])

  // ── Skip to next question ─────────────────────────────────────────────────
  const handleSkipToNext = useCallback(async () => {
    clearAllTimers()
    setPhase("processing")
    setIsProcessing(true)
    repeatAttemptRef.current = false
    // Reset to normal listen mode ref
    startListeningModeRef.current = startListeningMode

    try {
      // Record skipped question in session before calling backend
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
      })

      const nextQuestion = resp.next_question
      setWaitingForFollowUp(false)
      waitingForFollowUpRef.current = false
      setFollowUpProbeText("")

      if (nextQuestion?.question) {
        const nq = nextQuestion.question
        const qid = nq.id ?? (questionNumber + 1)
        if (usedQuestionIdsRef.current.has(qid)) {
          handleEndInterviewRef.current?.()
          return
        }
        usedQuestionIdsRef.current.add(qid)

        setCurrentQuestion(nq)
        setQuestionNumber(nq.id || questionNumber + 1)
        setDisplayedText(nq.text || "")

        const queue = buildAudioQueue(resp.ai_response, nextQuestion, false)
        if (queue.length > 0) {
          playAudioQueue(queue)
        } else {
          setPhase("idle")
          startListeningModeRef.current?.()
        }
      } else {
        handleEndInterviewRef.current?.()
      }
    } catch (err) {
      setError(err.message || "Something went wrong. Ending interview.")
      handleEndInterviewRef.current?.()
    } finally {
      setIsProcessing(false)
    }
  }, [
    session, currentQuestion, questionNumber, displayedText,
    totalQuestions, clearAllTimers, setPhase, playAudioQueue, startListeningMode,
  ])

  const handleSkipToNextRef = useRef(handleSkipToNext)
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
    clearAllTimers()
    window.speechSynthesis?.cancel()
    // Cancel any running audio queue
    activePlayIdRef.current++
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    stopListeningStream()
    // Stop all camera + mic tracks so browser removes the recording indicator
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    // Clear video element — removes the frozen frame and releases the camera
    if (videoRef.current) videoRef.current.srcObject = null
    // Stop volume monitoring and close Web Audio context
    if (volumeFrameRef.current) cancelAnimationFrame(volumeFrameRef.current)
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null
    navigate("/feedback")
  }, [clearAllTimers, stopListeningStream])

  const handleEndInterviewRef = useRef(handleEndInterview)
  useEffect(() => { handleEndInterviewRef.current = handleEndInterview }, [handleEndInterview])

  // ── Derived UI values ──────────────────────────────────────────────────────
  const progressPercent = Math.round((questionNumber / totalQuestions) * 100)
  const stage = questionNumber <= 3 ? "Early" : questionNumber <= 7 ? "Mid" : "Late"

  // Countdown ring for SVG circle (r=18, circumference ≈ 113)
  const RING_CIRC = 113
  const maxCountdown =
    listenPhase === "repeat_countdown" ? REPEAT_LISTEN_S : FIRST_COUNTDOWN_S
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
          <div className="relative bg-card rounded-2xl overflow-hidden border border-border flex-1">
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

            {isCamOn ? (
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Camera Off</span>
              </div>
            )}

            {/* Mic activity indicator in camera panel */}
            {(listenPhase === "speaking" || listenPhase === "repeat_speaking") && (
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

            {/* Repeat prompt banner */}
            {(listenPhase === "repeat_prompt" || listenPhase === "repeat_countdown" || listenPhase === "repeat_speaking") && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-sm text-amber-400 text-center">
                {listenPhase === "repeat_prompt"
                  ? "Checking in with you…"
                  : `Say "Yes" to repeat or "No" to continue (${countdownValue}s)`}
              </div>
            )}

            {/* Motivational message banner */}
            {listenPhase === "motivating" && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-5 py-4 text-sm text-emerald-400 text-center leading-relaxed">
                {statusText}
              </div>
            )}

            {/* Skip countdown banner */}
            {listenPhase === "second_countdown" && (
              <div className="rounded-xl bg-secondary border border-border px-4 py-3 text-sm text-muted-foreground text-center">
                Moving to the next question in {skipCountdownValue}s…
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
            {(listenPhase === "countdown" || listenPhase === "repeat_countdown") && !isProcessing && (
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor"
                      strokeWidth="3" className="text-secondary" />
                    <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor"
                      strokeWidth="3" strokeLinecap="round"
                      className={listenPhase === "repeat_countdown" ? "text-amber-400" : "text-primary"}
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
                  <span className="text-foreground text-sm font-medium">
                    {listenPhase === "repeat_countdown" ? "Listening for your response…" : "Listening…"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {listenPhase === "repeat_countdown"
                      ? 'Say "Yes" or "No"'
                      : "Start speaking whenever you're ready"}
                  </span>
                </div>
              </div>
            )}

            {/* Active recording indicator */}
            {(listenPhase === "speaking" || listenPhase === "repeat_speaking") && !isProcessing && (
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
                  {listenPhase === "repeat_speaking" ? "Detecting your response…" : "Will auto-submit when you stop"}
                </span>
              </div>
            )}

            {/* Skip countdown */}
            {listenPhase === "second_countdown" && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-secondary border-t-muted-foreground rounded-full animate-spin" />
                <span className="text-muted-foreground text-sm">
                  Next question in {skipCountdownValue}s
                </span>
              </div>
            )}

            {/* Motivating */}
            {listenPhase === "motivating" && (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-sm font-medium">💬 {statusText}</span>
              </div>
            )}

            {/* Repeat prompt */}
            {listenPhase === "repeat_prompt" && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <span className="text-amber-400 text-sm">Asking if you need a repeat…</span>
              </div>
            )}

            {/* Idle fallback */}
            {listenPhase === "idle" && !isAISpeaking && !isProcessing && (
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
