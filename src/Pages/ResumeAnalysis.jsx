import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  FileText,
  Briefcase,
  Award,
  Code,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  User,
  ChevronDown,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
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

// ── Constants ────────────────────────────────────────────────────────────────

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
  { value: "HR", label: "HR", description: "Focuses on culture fit, values, and soft skills" },
  { value: "Manager", label: "Manager", description: "Assesses ownership, delivery, and team impact" },
  { value: "Technical Lead", label: "Technical Lead", description: "Digs into system design and technical depth" },
  { value: "Team Lead", label: "Team Lead", description: "Evaluates collaboration and day-to-day execution" },
  { value: "CEO", label: "CEO", description: "Big-picture thinking, vision, and leadership" },
  { value: "CFO", label: "CFO", description: "Business acumen, priorities, and financial awareness" },
]

// ── Resume data mapper ────────────────────────────────────────────────────────

function mapResumeData(raw) {
  if (!raw) return null

  const atsScore = raw.atsScore ?? 75
  const rare = raw.rare || {}

  const toPercent = (v) => Math.round((parseFloat(v) || 0) * 20)
  const sections = [
    { name: "Readability",   score: toPercent(rare.readability),   icon: FileText },
    { name: "Applicability", score: toPercent(rare.applicability), icon: Briefcase },
    { name: "Remarkability", score: toPercent(rare.remarkability), icon: Award },
    { name: "Skills Match",  score: atsScore,                      icon: Code },
  ]

  const skills = (raw.skills || []).slice(0, 10).map((name, i) => ({
    name,
    level: Math.max(60, 95 - i * 4),
  }))

  const strengths = (raw.matchedKeywords || raw.keywords || []).slice(0, 4).map(
    (kw) => `Strong match: ${kw}`
  )
  if (strengths.length === 0 && skills.length > 0) {
    strengths.push(...skills.slice(0, 3).map((s) => `Demonstrated ${s.name} proficiency`))
  }

  const improvements = (raw.atsSuggestions || []).slice(0, 4)

  return {
    fileName: raw.fileName || "resume.pdf",
    overallScore: atsScore,
    sections,
    skills,
    strengths,
    improvements,
    fallbackRoles: raw.fallbackRoles || [],
    recommendation: raw.hasJobDescription
      ? "Your resume has been analyzed against the job description. Focus on the matched keywords and address the missing ones highlighted above to maximize your ATS score."
      : "Your resume looks solid. Quantify your achievements with metrics and tailor keywords to your target role for the best interview preparation.",
  }
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ResumeAnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [progress, setProgress] = useState(0)
  const [resumeData, setResumeData] = useState(null)

  // Interview config state
  const [selectedRole, setSelectedRole] = useState("")
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const [selectedInterviewer, setSelectedInterviewer] = useState("")

  // Load resume data and pre-fill role
  useEffect(() => {
    const raw =
      location.state?.resumeData ||
      JSON.parse(localStorage.getItem("resumeData") || "null")

    if (!raw) {
      navigate("/home", { replace: true })
      return
    }

    const mapped = mapResumeData(raw)
    setResumeData(mapped)

    // Pre-fill role from the first suggested role
    const firstRole = raw.fallbackRoles?.[0] || ""
    setSelectedRole(firstRole)
  }, [])

  // Progress bar animation
  useEffect(() => {
    if (!isAnalyzing) return
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => setIsAnalyzing(false), 400)
          return 100
        }
        return prev + 3
      })
    }, 40)
    return () => clearInterval(interval)
  }, [isAnalyzing])

  const userName = JSON.parse(localStorage.getItem("user") || "{}").full_name || "User"

  const canStart = selectedRole && selectedDifficulty && selectedInterviewer

  const handleReset = () => {
    localStorage.removeItem("resumeData")
    localStorage.removeItem("interviewConfig")
    navigate("/home", { replace: true })
  }

  const handleStartInterview = () => {
    // Persist the interview config so Interview.jsx can pre-fill from it
    const interviewConfig = {
      role: selectedRole,
      difficulty: selectedDifficulty,
      interviewer: selectedInterviewer,
    }
    localStorage.setItem("interviewConfig", JSON.stringify(interviewConfig))
    navigate("/interview")
  }

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (isAnalyzing) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <div className="text-center space-y-8">
          <GlowingOrb size="xl" isSpeaking={true} />
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-foreground">Analyzing Your Resume</h2>
            <p className="text-muted-foreground">Our AI is extracting insights...</p>
          </div>
          <div className="w-80 mx-auto space-y-2">
            <Progress value={progress} className="h-2 bg-muted" />
            <p className="text-sm text-muted-foreground">{progress}% Complete</p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            {progress < 30 && "Parsing document..."}
            {progress >= 30 && progress < 60 && "Extracting skills..."}
            {progress >= 60 && progress < 90 && "Evaluating experience..."}
            {progress >= 90 && "Generating insights..."}
          </div>
        </div>
      </div>
    )
  }

  if (!resumeData) return null

  // ── Analysis view ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen gradient-mesh relative">
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl" />

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-7xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <GlowingOrb size="md" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Resume Analysis</h1>
              <p className="text-muted-foreground">AI-powered insights for {userName}</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            title="Upload a different resume"
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">

          {/* ── Left Column ──────────────────────────────────────────────────── */}
          <div className="lg:col-span-1 space-y-6">

            {/* ATS Score */}
            <GlassCard>
              <div className="text-center space-y-4">
                <h3 className="text-lg font-semibold text-foreground">ATS Score</h3>
                <div className="relative w-40 h-40 mx-auto">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
                    <circle
                      cx="80" cy="80" r="70"
                      stroke="currentColor" strokeWidth="12" fill="none"
                      strokeDasharray={440}
                      strokeDashoffset={440 - (440 * resumeData.overallScore) / 100}
                      strokeLinecap="round"
                      className="text-primary transition-all duration-1000 ease-out"
                      style={{ filter: "drop-shadow(0 0 10px var(--glow-primary))" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-primary">{resumeData.overallScore}</span>
                    <span className="text-sm text-muted-foreground">out of 100</span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-500">
                    {resumeData.overallScore >= 80
                      ? "Above average"
                      : resumeData.overallScore >= 60
                      ? "Average"
                      : "Needs improvement"}
                  </span>
                </div>
              </div>
            </GlassCard>

            {/* Profile Info */}
            <GlassCard>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{userName}</h3>
                    <p className="text-sm text-muted-foreground">Candidate</p>
                  </div>
                </div>
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    {resumeData.fileName}
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Section Scores */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-foreground mb-4">Section Scores</h3>
              <div className="space-y-4">
                {resumeData.sections.map((section) => (
                  <div key={section.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <section.icon className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">{section.name}</span>
                      </div>
                      <span className="text-sm font-medium text-primary">{section.score}%</span>
                    </div>
                    <Progress value={section.score} className="h-1.5 bg-muted" />
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* ── Right Column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Detected Skills */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-6">
                <Code className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Detected Skills</h3>
              </div>
              {resumeData.skills.length > 0 ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  {resumeData.skills.map((skill) => (
                    <div key={skill.name} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{skill.name}</span>
                        <span className="text-sm text-muted-foreground">{skill.level}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-accent progress-glow transition-all duration-1000"
                          style={{ width: `${skill.level}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No skills detected. Ensure your resume mentions specific technologies and tools.
                </p>
              )}
            </GlassCard>

            {/* Strengths & Improvements */}
            <div className="grid sm:grid-cols-2 gap-6">
              <GlassCard>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h3 className="text-lg font-semibold text-foreground">Strengths</h3>
                </div>
                <ul className="space-y-3">
                  {resumeData.strengths.length > 0 ? (
                    resumeData.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{strength}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">Analysis complete — see your ATS score above.</li>
                  )}
                </ul>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold text-foreground">Areas to Improve</h3>
                </div>
                <ul className="space-y-3">
                  {resumeData.improvements.length > 0 ? (
                    resumeData.improvements.map((improvement, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-2 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{improvement}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-muted-foreground">Great job! No major improvements suggested.</li>
                  )}
                </ul>
              </GlassCard>
            </div>

            {/* AI Recommendation */}
            <GlassCard className="border-primary/30">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-foreground">AI Recommendation</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {resumeData.recommendation}
                  </p>
                </div>
              </div>
            </GlassCard>

            {/* ── Interview Configuration ─────────────────────────────────── */}
            <GlassCard className="border-primary/20">
              <div className="space-y-6">
                <div className="flex items-center gap-3 pb-2 border-b border-border">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <ChevronDown className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Configure Your Interview</h3>
                    <p className="text-xs text-muted-foreground">Set these before starting — they shape your questions and interviewer tone</p>
                  </div>
                </div>

                {/* Role Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Target Role
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Suggested based on your resume — pick the one you're aiming for
                  </p>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger className="bg-input border-border focus:border-primary rounded-xl h-11 text-foreground">
                      <SelectValue placeholder="Select a role..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-xl">
                      {resumeData.fallbackRoles.length > 0 ? (
                        resumeData.fallbackRoles.map((role) => (
                          <SelectItem key={role} value={role} className="text-foreground focus:bg-primary/10 focus:text-primary cursor-pointer">
                            {role}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="Software Engineer">Software Engineer</SelectItem>
                          <SelectItem value="Frontend Developer">Frontend Developer</SelectItem>
                          <SelectItem value="Backend Developer">Backend Developer</SelectItem>
                          <SelectItem value="Full Stack Developer">Full Stack Developer</SelectItem>
                          <SelectItem value="Data Scientist">Data Scientist</SelectItem>
                          <SelectItem value="ML Engineer">ML Engineer</SelectItem>
                          <SelectItem value="Product Manager">Product Manager</SelectItem>
                          <SelectItem value="DevOps Engineer">DevOps Engineer</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Difficulty Picker */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Difficulty Level
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Sets the depth and complexity of follow-up questions
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setSelectedDifficulty(d.value)}
                        className={cn(
                          "rounded-xl border-2 p-3 text-left transition-all duration-200 space-y-1",
                          selectedDifficulty === d.value ? d.activeClass : d.inactiveClass
                        )}
                      >
                        <div className="font-bold text-base">{d.label}</div>
                        <div className="text-xs leading-snug opacity-80">{d.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interviewer Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-foreground">
                    Interviewer Persona
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Each persona focuses on different aspects of your fit
                  </p>
                  <Select value={selectedInterviewer} onValueChange={setSelectedInterviewer}>
                    <SelectTrigger className="bg-input border-border focus:border-primary rounded-xl h-11 text-foreground">
                      <SelectValue placeholder="Select an interviewer..." />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border rounded-xl">
                      {INTERVIEWERS.map((i) => (
                        <SelectItem key={i.value} value={i.value} className="text-foreground focus:bg-primary/10 focus:text-primary cursor-pointer">
                          <div>
                            <span className="font-medium">{i.label}</span>
                            <span className="text-muted-foreground text-xs ml-2">— {i.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Validation hint */}
                {!canStart && (
                  <p className="text-xs text-muted-foreground text-center">
                    Complete all three fields above to unlock the interview
                  </p>
                )}
              </div>
            </GlassCard>

            {/* Start Button */}
            <div className="flex justify-center pt-2 pb-6">
              <Button
                onClick={handleStartInterview}
                disabled={!canStart}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-10 font-semibold glow-border text-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
              >
                Start Your Interview
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <UserStatus
        userName={userName}
        onLogout={() => {
          localStorage.removeItem("authToken")
          localStorage.removeItem("user")
          navigate("/login")
        }}
      />
    </div>
  )
}
