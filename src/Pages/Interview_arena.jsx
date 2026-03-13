import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { RotateCcw, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Mock interview questions
const interviewQuestions = [
  "Can you walk me through a time when you had to explain a complex ML model to a non-technical stakeholder?",
  "Tell me about yourself and your background in data science.",
  "What drew you to data science as a career?",
  "Describe a challenging project you worked on and how you overcame obstacles.",
  "How do you stay updated with the latest developments in machine learning?",
  "Tell me about a time when you had to work with incomplete data.",
  "What is your approach to feature engineering?",
  "How do you handle model deployment and monitoring?",
  "Describe your experience with A/B testing.",
  "Where do you see the future of AI heading?",
]

export default function InterviewArenaPage() {
  const navigate = useNavigate()
  const videoRef = useRef(null)

  const [currentQuestion, setCurrentQuestion] = useState(2)
  const [isAISpeaking, setIsAISpeaking] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(true)
  const [displayedText, setDisplayedText] = useState("")
  const [stats, setStats] = useState({
    topics: 3,
    connections: 2,
    patterns: 1,
  })

  // Simulate AI speaking with typing effect
  useEffect(() => {
    setIsAISpeaking(true)
    setIsRecording(false)
    setDisplayedText("")

    const fullText = interviewQuestions[currentQuestion]
    let charIndex = 0

    const typingInterval = setInterval(() => {
      if (charIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, charIndex + 1))
        charIndex++
      } else {
        clearInterval(typingInterval)
        setTimeout(() => {
          setIsAISpeaking(false)
          setIsRecording(true)
        }, 500)
      }
    }, 40)

    return () => clearInterval(typingInterval)
  }, [currentQuestion])

  // Initialize camera
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.log("Camera access denied:", err)
        })
    }
  }, [])

  const handleNextQuestion = () => {
    if (currentQuestion < interviewQuestions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
      setStats((prev) => ({
        topics: Math.min(prev.topics + 1, 10),
        connections: Math.min(prev.connections + 1, 10),
        patterns: Math.min(prev.patterns + 1, 10),
      }))
    }
  }

  const handleRepeatQuestion = () => {
    setIsAISpeaking(true)
    setIsRecording(false)
    setDisplayedText("")

    const fullText = interviewQuestions[currentQuestion]
    let charIndex = 0

    const typingInterval = setInterval(() => {
      if (charIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, charIndex + 1))
        charIndex++
      } else {
        clearInterval(typingInterval)
        setTimeout(() => {
          setIsAISpeaking(false)
          setIsRecording(true)
        }, 500)
      }
    }, 40)
  }

  const handleEndInterview = () => {
    navigate("/feedback")
  }

  const progressPercent =
    ((currentQuestion + 1) / interviewQuestions.length) * 100

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Bar */}
      <div className="flex-shrink-0 bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left: Question Progress */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-foreground font-medium">
                Q{currentQuestion + 1}
              </span>
              <span className="text-muted-foreground">/</span>
              <span className="text-muted-foreground">
                {interviewQuestions.length}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-24 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Stage Info */}
            <span className="text-muted-foreground text-sm">
              Stage: Mid · General
            </span>
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
                  isMicOn
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                Mic
              </button>
              <button
                onClick={() => setIsCamOn(!isCamOn)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                  isCamOn
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                Cam
              </button>
            </div>

            {/* Camera View */}
            {isCamOn ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-muted-foreground text-sm">
                  Your Camera
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right: AI Avatar Area */}
        <div className="flex-1 relative bg-background rounded-2xl overflow-hidden border border-border">
          {/* Manager Badge */}
          <div className="absolute top-4 right-4 z-10">
            <span className="px-4 py-2 rounded-full bg-secondary text-foreground text-sm font-medium border border-border">
              Manager
            </span>
          </div>

          {/* Glowing Orb */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Outer glow */}
            <div
              className={cn(
                "absolute w-64 h-64 rounded-full transition-all duration-500",
                isAISpeaking
                  ? "bg-cyan-400/20 blur-3xl scale-110"
                  : "bg-cyan-400/10 blur-2xl scale-100"
              )}
            />
            {/* Middle glow */}
            <div
              className={cn(
                "absolute w-40 h-40 rounded-full transition-all duration-300",
                isAISpeaking
                  ? "bg-cyan-400/40 blur-2xl"
                  : "bg-cyan-400/20 blur-xl"
              )}
            />
            {/* Inner orb */}
            <div
              className={cn(
                "relative w-24 h-24 rounded-full transition-all duration-200",
                isAISpeaking
                  ? "bg-gradient-to-br from-cyan-400 to-teal-500 shadow-[0_0_60px_rgba(34,211,238,0.6)]"
                  : "bg-gradient-to-br from-cyan-400/80 to-teal-600 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
              )}
              style={{
                animation: isAISpeaking ? "orbPulse 1.5s ease-in-out infinite" : "none",
              }}
            />
          </div>

          {/* AI Status Text */}
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2">
            <span className="text-muted-foreground text-sm">
              {isAISpeaking ? "AI is speaking..." : "Listening..."}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Section: Transcript + Controls */}
      <div className="flex-shrink-0 bg-background border-t border-border px-6 py-5">
        {/* AI Transcript */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <span className="text-muted-foreground text-sm">AI Transcript</span>
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
            variant="outline"
            className="rounded-lg border-border bg-transparent text-foreground hover:bg-secondary h-11 px-5 gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Repeat
          </Button>

          {/* Center: Recording Status */}
          <div className="flex items-center gap-2">
            {isRecording && (
              <>
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-sm font-medium">
                  Recording your answer...
                </span>
              </>
            )}
            {isAISpeaking && (
              <>
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="text-primary text-sm font-medium">
                  AI is speaking...
                </span>
              </>
            )}
          </div>

          {/* Right: Next + End Interview */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleNextQuestion}
              disabled={currentQuestion >= interviewQuestions.length - 1}
              variant="outline"
              className="rounded-lg border-border bg-transparent text-foreground hover:bg-secondary h-11 px-5 gap-2 disabled:opacity-50"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>

            <Button
              onClick={handleEndInterview}
              className="rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground h-11 px-5"
            >
              End Interview
            </Button>
          </div>
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
