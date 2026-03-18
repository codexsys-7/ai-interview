import { useState, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import {
  FileText,
  Briefcase,
  GraduationCap,
  Award,
  Code,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"

// Map backend response to UI-ready structure
function mapResumeData(raw) {
  if (!raw) return null

  const atsScore = raw.atsScore ?? 75
  const rare = raw.rare || {}

  // Section scores from rare metrics (0-5 → 0-100)
  const toPercent = (v) => Math.round((parseFloat(v) || 0) * 20)
  const sections = [
    { name: "Readability",    score: toPercent(rare.readability),   icon: FileText },
    { name: "Applicability",  score: toPercent(rare.applicability), icon: Briefcase },
    { name: "Remarkability",  score: toPercent(rare.remarkability), icon: Award },
    { name: "Skills Match",   score: atsScore,                       icon: Code },
  ]

  // Skills — backend returns strings; assign staggered levels for visual
  const skills = (raw.skills || []).slice(0, 10).map((name, i) => ({
    name,
    level: Math.max(60, 95 - i * 4),
  }))

  // Strengths from keywords if no matched keywords
  const strengths = (raw.matchedKeywords || raw.keywords || []).slice(0, 4).map(
    (kw) => `Strong match: ${kw}`
  )
  if (strengths.length === 0 && skills.length > 0) {
    strengths.push(...skills.slice(0, 3).map((s) => `Demonstrated ${s.name} proficiency`))
  }

  // Improvements from atsSuggestions
  const improvements = (raw.atsSuggestions || []).slice(0, 4)

  return {
    fileName: raw.fileName || "resume.pdf",
    overallScore: atsScore,
    sections,
    skills,
    strengths,
    improvements,
    recommendation: raw.hasJobDescription
      ? "Your resume has been analyzed against the job description. Focus on the matched keywords and address the missing ones highlighted above to maximize your ATS score."
      : "Your resume looks solid. Quantify your achievements with metrics and tailor keywords to your target role for the best interview preparation.",
  }
}

export default function ResumeAnalysisPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [progress, setProgress] = useState(0)
  const [resumeData, setResumeData] = useState(null)

  // Load data: router state → localStorage → redirect
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
  }, [])

  // Progress bar animation while "analyzing"
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

  return (
    <div className="min-h-screen gradient-mesh relative">
      {/* Background */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-accent/10 rounded-full blur-2xl" />

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <GlowingOrb size="md" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Resume Analysis</h1>
              <p className="text-muted-foreground">AI-powered insights for {userName}</p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/interview")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-12 px-6 font-semibold glow-border"
          >
            Start Interview
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Score & Overview */}
          <div className="lg:col-span-1 space-y-6">
            {/* Overall Score */}
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
                    {resumeData.overallScore >= 80 ? "Above average" : resumeData.overallScore >= 60 ? "Average" : "Needs improvement"}
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

          {/* Right Column - Skills & Insights */}
          <div className="lg:col-span-2 space-y-6">
            {/* Skills */}
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
                <p className="text-sm text-muted-foreground">No skills detected. Ensure your resume mentions specific technologies and tools.</p>
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

            {/* Action Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => navigate("/interview")}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-10 font-semibold glow-border text-lg"
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
