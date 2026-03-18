import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { RotateCcw, ArrowRight, Mic, MicOff, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiTranscribe, apiSubmitAnswerRealtime, apiSubmitFollowup } from "@/api/client"

// ---- Audio queue helpers ----

function buildAudioQueue(aiResponse, nextQuestion) {
  const items = []
  if (aiResponse?.acknowledgment?.audio_url)
    items.push({ url: aiResponse.acknowledgment.audio_url, label: "acknowledgment" })
  if (aiResponse?.follow_up_probe?.audio_url)
    items.push({ url: aiResponse.follow_up_probe.audio_url, label: "follow_up" })
  if (aiResponse?.transition?.audio_url)
    items.push({ url: aiResponse.transition.audio_url, label: "transition" })
  if (nextQuestion?.interviewer_comment_audio_url)
    items.push({ url: nextQuestion.interviewer_comment_audio_url, label: "comment" })
  if (nextQuestion?.question?.audio_url)
    items.push({ url: nextQuestion.question.audio_url, label: "question" })
  return items
}

export default function InterviewArenaPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const videoRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioRef = useRef(null)
  const streamRef = useRef(null)

  // Session state
  const [session, setSession] = useState(null)
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionNumber, setQuestionNumber] = useState(1)
  const [totalQuestions, setTotalQuestions] = useState(10)

  // UI state
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [displayedText, setDisplayedText] = useState("")
  const [statusText, setStatusText] = useState("Loading interview...")
  const [error, setError] = useState("")

  // Follow-up state
  const [waitingForFollowUp, setWaitingForFollowUp] = useState(false)
  const [followUpProbeText, setFollowUpProbeText] = useState("")

  // Stats
  const [stats, setStats] = useState({ topics: 0, connections: 0, patterns: 0 })

  // Audio queue
  const [audioQueue, setAudioQueue] = useState([])
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0)
  const [isPlayingQueue, setIsPlayingQueue] = useState(false)

  // ---- Load session on mount ----
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
      setCurrentQuestion(first.question)
      setQuestionNumber(first.question.id || 1)
      setDisplayedText(first.question.text || "")

      // Play first question audio if available
      if (first.question.audio_url) {
        playAudioQueue([{ url: first.question.audio_url, label: "question" }])
      } else {
        setStatusText("Recording ready")
      }
    } else {
      setDisplayedText("Tell me about yourself.")
      setStatusText("Recording ready")
    }
  }, [])

  // ---- Camera init ----
  useEffect(() => {
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch(() => {})
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ---- Audio queue playback ----
  const playAudioQueue = useCallback((queue) => {
    if (!queue || queue.length === 0) {
      setIsAISpeaking(false)
      setStatusText("Recording ready")
      return
    }
    setAudioQueue(queue)
    setCurrentAudioIndex(0)
    setIsPlayingQueue(true)
    setIsAISpeaking(true)
    setIsRecording(false)
  }, [])

  useEffect(() => {
    if (!isPlayingQueue || audioQueue.length === 0) return
    if (currentAudioIndex >= audioQueue.length) {
      setIsPlayingQueue(false)
      setIsAISpeaking(false)
      setStatusText("Recording ready")
      return
    }

    const item = audioQueue[currentAudioIndex]
    const audio = new Audio(item.url)
    audioRef.current = audio

    audio.onended = () => {
      setCurrentAudioIndex((prev) => prev + 1)
    }
    audio.onerror = () => {
      // Skip failed audio items
      setCurrentAudioIndex((prev) => prev + 1)
    }
    audio.play().catch(() => {
      setCurrentAudioIndex((prev) => prev + 1)
    })

    return () => {
      audio.pause()
    }
  }, [isPlayingQueue, currentAudioIndex, audioQueue])

  // ---- Recording ----
  const startRecording = useCallback(() => {
    if (isAISpeaking || isProcessing || !isMicOn) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not available in this browser.")
      return
    }

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start()
      setIsRecording(true)
      setStatusText("Recording your answer...")
    }).catch(() => {
      setError("Could not access microphone. Please check permissions.")
    })
  }, [isAISpeaking, isProcessing, isMicOn])

  const stopRecordingAndSubmit = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return

    setIsRecording(false)
    setIsProcessing(true)
    setStatusText("Processing your answer...")

    mediaRecorderRef.current.stop()
    mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop())

    // Wait for data to be collected
    await new Promise((resolve) => setTimeout(resolve, 200))

    const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
    const durationSeconds = blob.size / 16000 // rough estimate

    let transcript = ""
    try {
      setStatusText("Transcribing...")
      const transcribeResp = await apiTranscribe(blob)
      transcript = transcribeResp.transcript || ""
    } catch {
      transcript = "[Audio transcription failed — proceeding with empty answer]"
    }

    if (!transcript.trim()) {
      setIsProcessing(false)
      setStatusText("Recording ready")
      setError("No speech detected. Please try speaking again.")
      return
    }

    setError("")

    try {
      setStatusText("Getting AI response...")
      const resp = waitingForFollowUp
        ? await apiSubmitFollowup({
            sessionId: session.sessionId,
            originalQuestionId: currentQuestion?.id || questionNumber,
            originalQuestionText: currentQuestion?.text || displayedText,
            originalQuestionIntent: currentQuestion?.intent || "behavioral",
            followUpAnswer: transcript,
            role: session.role,
            difficulty: session.difficulty,
            totalQuestions,
            generateAudio: true,
          })
        : await apiSubmitAnswerRealtime({
            sessionId: session.sessionId,
            questionId: currentQuestion?.id || questionNumber,
            questionText: currentQuestion?.text || displayedText,
            questionIntent: currentQuestion?.intent || "behavioral",
            role: session.role,
            userAnswer: transcript,
            transcriptRaw: transcript,
            audioDurationSeconds: durationSeconds,
            difficulty: session.difficulty,
            totalQuestions,
            generateAudio: true,
          })

      // Save answered question for feedback
      const answeredQuestions = JSON.parse(
        localStorage.getItem("interviewSession") || "{}"
      ).answeredQuestions || []
      answeredQuestions.push({
        id: currentQuestion?.id || questionNumber,
        prompt: currentQuestion?.text || displayedText,
        interviewer: "AI Interviewer",
        type: currentQuestion?.type || "behavioral",
        userAnswer: transcript,
        idealAnswer: null,
      })
      const stored = JSON.parse(localStorage.getItem("interviewSession") || "{}")
      stored.answeredQuestions = answeredQuestions
      localStorage.setItem("interviewSession", JSON.stringify(stored))

      // Update stats
      const metadata = resp.next_question?.metadata || {}
      setStats((prev) => ({
        topics: metadata.topics_count || prev.topics + 1,
        connections: metadata.connections || prev.connections,
        patterns: metadata.patterns_detected || prev.patterns,
      }))

      // Handle flow control
      const flowControl = resp.flow_control || {}
      const nextQuestion = resp.next_question

      if (flowControl.needs_follow_up && !waitingForFollowUp) {
        // AI wants more detail — show follow-up probe
        setWaitingForFollowUp(true)
        const probeText = resp.ai_response?.follow_up_probe?.text || "Could you elaborate on that?"
        setFollowUpProbeText(probeText)

        const queue = buildAudioQueue(resp.ai_response, null)
        if (queue.length > 0) {
          playAudioQueue(queue)
        } else {
          setStatusText("Recording ready — elaborate on your answer")
        }
      } else {
        setWaitingForFollowUp(false)
        setFollowUpProbeText("")

        if (nextQuestion?.question) {
          const nq = nextQuestion.question
          setCurrentQuestion(nq)
          setQuestionNumber(nq.id || questionNumber + 1)
          setDisplayedText(nq.text || "")
          const queue = buildAudioQueue(resp.ai_response, nextQuestion)
          playAudioQueue(queue.length > 0 ? queue : [])
        } else {
          // No more questions — end interview
          handleEndInterview()
          return
        }
      }
    } catch (err) {
      setError(err.message || "Failed to submit answer. Please try again.")
      setStatusText("Recording ready")
    } finally {
      setIsProcessing(false)
    }
  }, [
    session, currentQuestion, questionNumber, displayedText,
    totalQuestions, waitingForFollowUp, playAudioQueue,
  ])

  const handleRepeatQuestion = () => {
    if (currentQuestion?.audio_url) {
      playAudioQueue([{ url: currentQuestion.audio_url, label: "question" }])
    }
  }

  const handleEndInterview = () => {
    // Stop all audio/recording
    audioRef.current?.pause()
    mediaRecorderRef.current?.stop()
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop())
    streamRef.current?.getTracks().forEach((t) => t.stop())
    navigate("/feedback")
  }

  const progressPercent = Math.round((questionNumber / totalQuestions) * 100)
  const stage = questionNumber <= 3 ? "Early" : questionNumber <= 7 ? "Mid" : "Late"

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="flex-shrink-0 bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Question Progress */}
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

          {/* Right: Stats */}
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

      {/* Main Content Area */}
      <div className="flex-1 flex p-6 gap-6">
        {/* Left: User Camera Panel */}
        <div className="w-80 flex flex-col">
          <div className="relative bg-card rounded-2xl overflow-hidden border border-border flex-1">
            {/* Mic/Cam Toggle Buttons */}
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
          </div>
        </div>

        {/* Right: AI Avatar Area */}
        <div className="flex-1 relative bg-background rounded-2xl overflow-hidden border border-border">
          {/* Stage Badge */}
          <div className="absolute top-4 right-4 z-10">
            <span className="px-4 py-2 rounded-full bg-secondary text-foreground text-sm font-medium border border-border">
              AI Interviewer
            </span>
          </div>

          {/* Glowing Orb */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn("absolute w-64 h-64 rounded-full transition-all duration-500",
              isAISpeaking ? "bg-cyan-400/20 blur-3xl scale-110" : "bg-cyan-400/10 blur-2xl scale-100")} />
            <div className={cn("absolute w-40 h-40 rounded-full transition-all duration-300",
              isAISpeaking ? "bg-cyan-400/40 blur-2xl" : "bg-cyan-400/20 blur-xl")} />
            <div
              className={cn("relative w-24 h-24 rounded-full transition-all duration-200",
                isAISpeaking
                  ? "bg-gradient-to-br from-cyan-400 to-teal-500 shadow-[0_0_60px_rgba(34,211,238,0.6)]"
                  : "bg-gradient-to-br from-cyan-400/80 to-teal-600 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
              )}
              style={{ animation: isAISpeaking ? "orbPulse 1.5s ease-in-out infinite" : "none" }}
            />
          </div>

          {/* Follow-up probe indicator */}
          {waitingForFollowUp && followUpProbeText && (
            <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 w-full max-w-md px-4">
              <div className="rounded-xl bg-primary/10 border border-primary/30 px-4 py-3 text-sm text-primary text-center">
                {followUpProbeText}
              </div>
            </div>
          )}

          {/* AI Status Text */}
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2">
            <span className="text-muted-foreground text-sm">
              {isAISpeaking ? "AI is speaking..." : isProcessing ? "Processing..." : "Listening..."}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Transcript + Controls */}
      <div className="flex-shrink-0 bg-background border-t border-border px-6 py-5">
        {/* Error */}
        {error && (
          <div className="mb-3 rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        {/* AI Transcript */}
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

        {/* Control Bar */}
        <div className="flex items-center justify-between">
          {/* Left: Repeat Button */}
          <Button
            onClick={handleRepeatQuestion}
            disabled={isAISpeaking || isProcessing || !currentQuestion?.audio_url}
            variant="outline"
            className="rounded-lg border-border bg-transparent text-foreground hover:bg-secondary h-11 px-5 gap-2 disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Repeat
          </Button>

          {/* Center: Recording Status */}
          <div className="flex items-center gap-3">
            {isRecording && (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-sm font-medium">Recording...</span>
                <Button
                  onClick={stopRecordingAndSubmit}
                  className="rounded-lg bg-primary text-primary-foreground h-9 px-4 gap-2 text-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit Answer
                </Button>
              </>
            )}
            {!isRecording && !isAISpeaking && !isProcessing && (
              <Button
                onClick={startRecording}
                disabled={!isMicOn}
                className="rounded-lg bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 h-9 px-4 gap-2 text-sm"
              >
                <Mic className="w-3.5 h-3.5" />
                {waitingForFollowUp ? "Elaborate" : "Start Recording"}
              </Button>
            )}
            {isProcessing && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span className="text-primary text-sm">{statusText}</span>
              </div>
            )}
            {isAISpeaking && (
              <>
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-primary text-sm font-medium">AI is speaking...</span>
              </>
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
