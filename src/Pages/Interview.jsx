import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sparkles, FileText, ArrowRight, Clock, Target,
  MessageSquare, Briefcase, CheckCircle2, ChevronDown,
  Zap, Shield, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"
import { cn } from "@/lib/utils"
import { apiCreateSession, apiStartWithAudio } from "@/api/client"

const COMMON_ROLES = [
  "Software Engineer",
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "Data Scientist",
  "Product Manager",
  "DevOps Engineer",
  "UX Designer",
]

const DIFFICULTIES = [
  {
    value: "easy",
    label: "Easy",
    description: "Foundational questions, great for beginners",
    color: "text-green-400",
    activeBg: "border-green-500 bg-green-500/10",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced depth — ideal for most candidates",
    color: "text-yellow-400",
    activeBg: "border-yellow-500 bg-yellow-500/10",
  },
  {
    value: "hard",
    label: "Hard",
    description: "Senior-level probing with follow-ups",
    color: "text-red-400",
    activeBg: "border-red-500 bg-red-500/10",
  },
]

const INTERVIEWERS = [
  { name: "HR",           voice: "nova",  style: "Culture & Fit",  description: "Focuses on values, soft skills, and team culture",  icon: Users },
  { name: "Manager",      voice: "alloy", style: "Ownership",      description: "Assesses delivery, ownership, and team impact",     icon: Shield },
  { name: "Technical Lead", voice: "echo", style: "Technical Depth", description: "Digs into system design and engineering depth",   icon: Zap },
  { name: "Team Lead",    voice: "alloy", style: "Collaboration",  description: "Evaluates day-to-day execution and teamwork",       icon: Users },
  { name: "CEO",          voice: "echo",  style: "Big Picture",    description: "Vision, leadership, and strategic thinking",        icon: Shield },
  { name: "CFO",          voice: "echo",  style: "Business Acumen", description: "Priorities, financial awareness, and trade-offs",  icon: Zap },
]

export default function InterviewPage() {
  const navigate = useNavigate()

  // Step 1 state
  const [selectedType, setSelectedType] = useState(null)
  const [jobDescription, setJobDescription] = useState("")

  // Step 2 state
  const [role, setRole] = useState("")
  const [difficulty, setDifficulty] = useState(null)
  const [selectedInterviewer, setSelectedInterviewer] = useState(null)

  // Misc
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState("")

  // Pre-fill from interviewConfig saved on the resume analysis page
  useEffect(() => {
    const config = JSON.parse(localStorage.getItem("interviewConfig") || "null")
    const resumeData = JSON.parse(localStorage.getItem("resumeData") || "null")

    if (config?.role) {
      setRole(config.role)
    } else if (resumeData?.fallbackRoles?.[0]) {
      setRole(resumeData.fallbackRoles[0])
    }

    if (config?.difficulty) {
      setDifficulty(config.difficulty)
    }

    if (config?.interviewer) {
      const match = INTERVIEWERS.find((i) => i.name === config.interviewer)
      if (match) setSelectedInterviewer(match)
    }
  }, [])

  const step2Visible = !!selectedType

  const canStart =
    selectedType &&
    role.trim() &&
    difficulty &&
    selectedInterviewer &&
    (selectedType !== "job-description" || jobDescription.trim())

  const handleStartInterview = async () => {
    setIsStarting(true)
    setStartError("")
    try {
      const totalQuestions = selectedType === "job-description" ? 12 : 10

      // 1. Create session
      const sessionResp = await apiCreateSession({
        role: role.trim(),
        difficulty,
        questionCount: totalQuestions,
        interviewerNames: [selectedInterviewer.name],
        plan: null,
      })
      const sessionId = sessionResp.session_id

      // 2. Get first question with audio
      const startResp = await apiStartWithAudio({
        sessionId,
        role: role.trim(),
        difficulty,
        totalQuestions,
        generateAudio: true,
      })

      // 3. Save session info and navigate
      // Strip `icon` from the interviewer — Lucide components carry Symbol(react.forward_ref)
      // which can't be cloned by history.pushState and causes a "could not be cloned" error.
      const { icon: _icon, ...safeInterviewer } = selectedInterviewer ?? {}
      const sessionData = {
        sessionId,
        role: role.trim(),
        difficulty,
        totalQuestions,
        interviewer: safeInterviewer,
        firstQuestion: startResp.first_question,
        jobDescription: selectedType === "job-description" ? jobDescription : null,
        answeredQuestions: [],
      }
      localStorage.setItem("interviewSession", JSON.stringify(sessionData))
      navigate("/interview/arena", { state: { sessionData } })
    } catch (err) {
      setStartError(err.message || "Failed to start interview. Is the backend running?")
    } finally {
      setIsStarting(false)
    }
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-12">

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="text-center space-y-4 mb-12">
          <GlowingOrb size="lg" isSpeaking={!selectedType} />
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-8">
            Set Up Your <span className="text-primary glow-text">Interview</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Choose your interview type, then configure your session
          </p>
        </div>

        {/* ── STEP 1 — Interview Type ─────────────────────────────── */}
        <div className="w-full max-w-4xl mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            Step 1 — Interview Type
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {/* General */}
            <div
              onClick={() => setSelectedType("general")}
              className={cn(
                "cursor-pointer transition-all duration-300",
                selectedType === "general" && "scale-[1.02]"
              )}
            >
              <GlassCard
                className={cn(
                  "h-full border-2 transition-all duration-300",
                  selectedType === "general"
                    ? "border-primary glow-border"
                    : "border-transparent hover:border-primary/30"
                )}
              >
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
                      <MessageSquare className="w-7 h-7 text-primary" />
                    </div>
                    {selectedType === "general" && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">General Interview</h3>
                    <p className="text-muted-foreground">
                      Practice with common interview questions tailored to your resume and experience
                    </p>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">15–20 minutes</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">10 questions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">AI-adapted difficulty</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Job-Specific */}
            <div
              onClick={() => setSelectedType("job-description")}
              className={cn(
                "cursor-pointer transition-all duration-300",
                selectedType === "job-description" && "scale-[1.02]"
              )}
            >
              <GlassCard
                className={cn(
                  "h-full border-2 transition-all duration-300",
                  selectedType === "job-description"
                    ? "border-primary glow-border"
                    : "border-transparent hover:border-primary/30"
                )}
              >
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center">
                      <Briefcase className="w-7 h-7 text-primary" />
                    </div>
                    {selectedType === "job-description" && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">Job-Specific Interview</h3>
                    <p className="text-muted-foreground">
                      Paste a job description and practice with questions specific to that role
                    </p>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">20–30 minutes</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">12–15 questions</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Role-specific preparation</span>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>

        {/* Job Description Input */}
        {selectedType === "job-description" && (
          <div className="w-full max-w-4xl mt-6">
            <GlassCard>
              <div className="space-y-4">
                <Label htmlFor="job-description" className="text-lg font-semibold text-foreground">
                  Paste Job Description
                </Label>
                <Textarea
                  id="job-description"
                  placeholder="Paste the full job description here... Include responsibilities, requirements, and qualifications for the best results."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  className="min-h-[200px] bg-input border-border focus:border-primary focus:ring-primary/20 rounded-xl resize-none"
                />
                <p className="text-sm text-muted-foreground">
                  The more detailed the job description, the more tailored your interview questions will be.
                </p>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── STEP 2 — Role, Difficulty, Interviewer ──────────────── */}
        {step2Visible && (
          <div className="w-full max-w-4xl mt-10 space-y-8">
            {/* Step label */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <ChevronDown className="w-3 h-3" />
                Step 2 — Configure Your Session
              </div>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Role Selection */}
            <GlassCard>
              <div className="space-y-5">
                <div>
                  <Label className="text-lg font-semibold text-foreground">Target Role</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Questions and evaluation will be tailored to this role
                  </p>
                </div>

                {/* Quick-pick chips */}
                <div className="flex flex-wrap gap-2">
                  {COMMON_ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-sm border transition-all duration-200",
                        role === r
                          ? "border-primary bg-primary/15 text-primary font-medium"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Free-text input */}
                <Input
                  placeholder="Or type a custom role..."
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="bg-input border-border focus:border-primary rounded-xl h-11"
                />
              </div>
            </GlassCard>

            {/* Difficulty Picker */}
            <GlassCard>
              <div className="space-y-5">
                <div>
                  <Label className="text-lg font-semibold text-foreground">Difficulty Level</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sets the depth and complexity of follow-up questions
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setDifficulty(d.value)}
                      className={cn(
                        "rounded-xl border-2 p-4 text-left transition-all duration-200 space-y-1",
                        difficulty === d.value
                          ? d.activeBg
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className={cn("font-bold text-lg", d.color)}>{d.label}</div>
                      <div className="text-xs text-muted-foreground leading-snug">{d.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* Interviewer Selection */}
            <GlassCard>
              <div className="space-y-5">
                <div>
                  <Label className="text-lg font-semibold text-foreground">Choose Your Interviewer</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Each interviewer has a distinct style and voice
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  {INTERVIEWERS.map((interviewer) => {
                    const Icon = interviewer.icon
                    const isSelected = selectedInterviewer?.name === interviewer.name
                    return (
                      <button
                        key={interviewer.name}
                        onClick={() => setSelectedInterviewer(interviewer)}
                        className={cn(
                          "rounded-xl border-2 p-4 text-left transition-all duration-200 space-y-3",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/30"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center",
                            isSelected ? "bg-primary/20" : "bg-muted"
                          )}>
                            <Icon className={cn("w-5 h-5", isSelected ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                              <CheckCircle2 className="w-3 h-3 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{interviewer.name}</div>
                          <div className="text-xs text-primary font-medium">{interviewer.style}</div>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {interviewer.description}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* ── Error & Start Button ────────────────────────────────── */}
        {startError && (
          <div className="w-full max-w-2xl mt-6">
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive text-center">
              {startError}
            </div>
          </div>
        )}

        <Button
          onClick={handleStartInterview}
          disabled={!canStart || isStarting}
          size="lg"
          className="mt-10 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-12 font-semibold text-lg glow-border disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
        >
          {isStarting ? (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Preparing Interview...
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5" />
              Start Interview
              <ArrowRight className="w-5 h-5" />
            </div>
          )}
        </Button>

        {/* Tips */}
        <div className="mt-10 w-full max-w-2xl">
          <GlassCard className="bg-primary/5 border-primary/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-foreground">Pro Tip</h4>
                <p className="text-sm text-muted-foreground">
                  Find a quiet space, position your camera at eye level, and speak clearly.
                  The AI will evaluate your responses in real-time and provide detailed feedback.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <UserStatus
        userName={JSON.parse(localStorage.getItem("user") || "{}").full_name || "User"}
        onLogout={() => {
          localStorage.removeItem("authToken")
          localStorage.removeItem("user")
          navigate("/login")
        }}
      />
    </div>
  )
}
