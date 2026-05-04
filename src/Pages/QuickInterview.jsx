import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sparkles, ArrowRight, Zap, Shield, Users,
  Code, Database, Globe, Server, Cloud,
  BarChart2, Layers, Lock, Cpu, Briefcase,
  Dice5, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { apiCreateSession, apiStartWithAudio } from "@/api/client"

// ── Data ──────────────────────────────────────────────────────────────────────

const ROLES = [
  { label: "Software Engineer",      icon: Code },
  { label: "Frontend Developer",     icon: Globe },
  { label: "Backend Developer",      icon: Server },
  { label: "Full Stack Developer",   icon: Layers },
  { label: "Data Scientist",         icon: BarChart2 },
  { label: "ML Engineer",            icon: Cpu },
  { label: "DevOps Engineer",        icon: Cloud },
  { label: "Product Manager",        icon: Briefcase },
  { label: "Database Administrator", icon: Database },
  { label: "Cybersecurity Analyst",  icon: Lock },
]

const DIFFICULTIES = [
  {
    value: "easy",
    label: "Easy",
    description: "Foundational Q&A, great for beginners",
    activeClass: "border-green-500 bg-green-500/10 text-green-400",
    inactiveClass: "border-border text-muted-foreground hover:border-green-500/40",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced depth, ideal for most",
    activeClass: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
    inactiveClass: "border-border text-muted-foreground hover:border-yellow-500/40",
  },
  {
    value: "hard",
    label: "Hard",
    description: "Senior-level with deep follow-ups",
    activeClass: "border-red-500 bg-red-500/10 text-red-400",
    inactiveClass: "border-border text-muted-foreground hover:border-red-500/40",
  },
]

const INTERVIEWERS = [
  { value: "HR",             label: "HR",             description: "Culture fit, values, and soft skills" },
  { value: "Manager",        label: "Manager",         description: "Ownership, delivery, and team impact" },
  { value: "Technical Lead", label: "Technical Lead",  description: "System design and engineering depth" },
  { value: "Team Lead",      label: "Team Lead",       description: "Collaboration and day-to-day execution" },
  { value: "CEO",            label: "CEO",             description: "Vision, leadership, and big-picture thinking" },
  { value: "CFO",            label: "CFO",             description: "Business acumen and trade-off decisions" },
]

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickInterviewPage() {
  const navigate = useNavigate()

  const [selectedRole, setSelectedRole]           = useState(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const [selectedInterviewer, setSelectedInterviewer] = useState("")

  const [isStarting, setIsStarting]   = useState(false)
  const [isBattling, setIsBattling]   = useState(false)
  const [startError, setStartError]   = useState("")

  const canStart = selectedRole && selectedDifficulty && selectedInterviewer

  // ── Shared session launcher ───────────────────────────────────────────────

  async function launchSession(role, difficulty, interviewer) {
    const totalQuestions = 10
    const sessionResp = await apiCreateSession({
      role,
      difficulty,
      questionCount: totalQuestions,
      interviewerNames: [interviewer],
      plan: null,
    })
    const sessionId = sessionResp.session_id

    const startResp = await apiStartWithAudio({
      sessionId,
      role,
      difficulty,
      totalQuestions,
      generateAudio: true,
    })

    const sessionData = {
      sessionId,
      role,
      difficulty,
      totalQuestions,
      interviewer: { name: interviewer },
      firstQuestion: startResp.first_question,
      jobDescription: null,
      answeredQuestions: [],
    }
    localStorage.setItem("interviewSession", JSON.stringify(sessionData))
    navigate("/interview/arena", { state: { sessionData } })
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setIsStarting(true)
    setStartError("")
    try {
      await launchSession(selectedRole, selectedDifficulty, selectedInterviewer)
    } catch (err) {
      setStartError(err.message || "Failed to start interview. Is the backend running?")
    } finally {
      setIsStarting(false)
    }
  }

  const handleJustBattle = async () => {
    setIsBattling(true)
    setStartError("")
    try {
      const role       = pickRandom(ROLES).label
      const difficulty = pickRandom(DIFFICULTIES).value
      const interviewer = pickRandom(INTERVIEWERS).value
      await launchSession(role, difficulty, interviewer)
    } catch (err) {
      setStartError(err.message || "Failed to start interview. Is the backend running?")
    } finally {
      setIsBattling(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-5xl">

        {/* X — back to home */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => navigate("/home")}
            title="Back to home"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <GlowingOrb size="lg" isSpeaking={true} />
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-6">
            Quick <span className="text-primary glow-text">Interview</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Jump straight into practice — no resume needed. Pick your role, difficulty, and interviewer, then go.
          </p>
        </div>

        <div className="space-y-8">

          {/* ── Role Grid ─────────────────────────────────────────────────── */}
          <GlassCard>
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold text-foreground">
                  Target Role <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Pick the role you want to be interviewed for
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {ROLES.map(({ label, icon: Icon }) => {
                  const isSelected = selectedRole === label
                  return (
                    <button
                      key={label}
                      onClick={() => setSelectedRole(label)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all duration-200",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center",
                        isSelected ? "bg-primary/20" : "bg-muted"
                      )}>
                        <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <span className={cn(
                        "text-xs font-medium leading-tight",
                        isSelected ? "text-primary" : "text-muted-foreground"
                      )}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </GlassCard>

          {/* ── Difficulty + Interviewer row ───────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* Difficulty */}
            <GlassCard>
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold text-foreground">
                    Difficulty <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sets the depth and complexity of questions
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setSelectedDifficulty(d.value)}
                      className={cn(
                        "rounded-xl border-2 px-4 py-3 text-left transition-all duration-200",
                        selectedDifficulty === d.value ? d.activeClass : d.inactiveClass
                      )}
                    >
                      <div className="font-bold text-sm">{d.label}</div>
                      <div className="text-xs opacity-80 mt-0.5">{d.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </GlassCard>

            {/* Interviewer */}
            <GlassCard>
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold text-foreground">
                    Interviewer Persona <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each persona has a distinct focus and tone
                  </p>
                </div>
                <Select value={selectedInterviewer} onValueChange={setSelectedInterviewer}>
                  <SelectTrigger className="bg-input border-border focus:border-primary rounded-xl h-11 text-foreground">
                    <SelectValue placeholder="Select an interviewer..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border rounded-xl">
                    {INTERVIEWERS.map((i) => (
                      <SelectItem
                        key={i.value}
                        value={i.value}
                        className="text-foreground focus:bg-primary/10 focus:text-primary cursor-pointer"
                      >
                        <span className="font-medium">{i.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">— {i.description}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Hint when nothing picked yet */}
                {!canStart && (
                  <p className="text-xs text-muted-foreground">
                    Complete all fields to unlock the start button
                  </p>
                )}

                {/* Spacer so card height matches difficulty card */}
                <div className="flex-1" />
              </div>
            </GlassCard>
          </div>

          {/* Error */}
          {startError && (
            <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive text-center">
              {startError}
            </div>
          )}

          {/* ── Action Buttons ──────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-8">

            {/* Primary — Start Interview */}
            <Button
              onClick={handleStart}
              disabled={!canStart || isStarting || isBattling}
              size="lg"
              className="w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-10 font-semibold text-base glow-border disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
            >
              {isStarting ? (
                <span className="flex items-center gap-3">
                  <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Preparing Arena...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Start Interview
                  <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>

            {/* Secondary — Just Battle */}
            <Button
              onClick={handleJustBattle}
              disabled={isStarting || isBattling}
              variant="outline"
              size="lg"
              className="w-full sm:w-auto rounded-xl h-14 px-8 font-semibold text-base border-2 border-accent/50 text-accent hover:bg-accent/10 hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
            >
              {isBattling ? (
                <span className="flex items-center gap-3">
                  <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  Rolling the dice...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Dice5 className="w-5 h-5" />
                  Not sure? Just Battle!
                </span>
              )}
            </Button>
          </div>

          {/* Just Battle description */}
          <p className="text-center text-xs text-muted-foreground -mt-4 pb-4">
            "Just Battle" picks a random role, difficulty, and interviewer and throws you straight into the arena
          </p>

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
