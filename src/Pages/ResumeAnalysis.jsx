import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
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

// Mock data for resume analysis
const resumeData = {
  name: "John Doe",
  email: "john.doe@email.com",
  phone: "+1 234 567 8900",
  overallScore: 85,
  sections: [
    { name: "Experience", score: 90, icon: Briefcase },
    { name: "Education", score: 88, icon: GraduationCap },
    { name: "Skills", score: 82, icon: Code },
    { name: "Achievements", score: 78, icon: Award },
  ],
  skills: [
    { name: "Python", level: 90 },
    { name: "Machine Learning", level: 85 },
    { name: "Data Analysis", level: 88 },
    { name: "SQL", level: 82 },
    { name: "Communication", level: 75 },
  ],
  strengths: [
    "Strong technical background in data science",
    "Relevant industry experience",
    "Clear quantified achievements",
    "Well-structured resume format",
  ],
  improvements: [
    "Add more leadership examples",
    "Include specific project outcomes",
    "Expand on soft skills section",
  ],
}

export default function ResumeAnalysisPage() {
  const navigate = useNavigate()
  const [isAnalyzing, setIsAnalyzing] = useState(true)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (isAnalyzing) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval)
            setTimeout(() => {
              setIsAnalyzing(false)
            }, 500)
            return 100
          }
          return prev + 2
        })
      }, 50)
      return () => clearInterval(interval)
    }
  }, [isAnalyzing])

  if (isAnalyzing) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <div className="text-center space-y-8">
          <GlowingOrb size="xl" isSpeaking={true} />
          <div className="space-y-4">
            <h2 className="text-3xl font-bold text-foreground">
              Analyzing Your Resume
            </h2>
            <p className="text-muted-foreground">
              Our AI is extracting insights...
            </p>
          </div>
          <div className="w-80 mx-auto space-y-2">
            <Progress value={progress} className="h-2 bg-muted" />
            <p className="text-sm text-muted-foreground">
              {progress}% Complete
            </p>
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
              <h1 className="text-3xl font-bold text-foreground">
                Resume Analysis
              </h1>
              <p className="text-muted-foreground">
                AI-powered insights for {resumeData.name}
              </p>
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
                <h3 className="text-lg font-semibold text-foreground">
                  Overall Score
                </h3>
                <div className="relative w-40 h-40 mx-auto">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      className="text-muted"
                    />
                    <circle
                      cx="80"
                      cy="80"
                      r="70"
                      stroke="currentColor"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={440}
                      strokeDashoffset={440 - (440 * resumeData.overallScore) / 100}
                      strokeLinecap="round"
                      className="text-primary transition-all duration-1000 ease-out"
                      style={{ filter: "drop-shadow(0 0 10px var(--glow-primary))" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-primary">
                      {resumeData.overallScore}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      out of 100
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-500">Above average</span>
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
                    <h3 className="font-semibold text-foreground">
                      {resumeData.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {resumeData.email}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="w-4 h-4" />
                    resume_john_doe.pdf
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Section Scores */}
            <GlassCard>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                Section Scores
              </h3>
              <div className="space-y-4">
                {resumeData.sections.map((section) => (
                  <div key={section.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <section.icon className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">
                          {section.name}
                        </span>
                      </div>
                      <span className="text-sm font-medium text-primary">
                        {section.score}%
                      </span>
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
                <h3 className="text-lg font-semibold text-foreground">
                  Detected Skills
                </h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {resumeData.skills.map((skill) => (
                  <div key={skill.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">
                        {skill.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {skill.level}%
                      </span>
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
            </GlassCard>

            {/* Strengths & Improvements */}
            <div className="grid sm:grid-cols-2 gap-6">
              <GlassCard>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Strengths
                  </h3>
                </div>
                <ul className="space-y-3">
                  {resumeData.strengths.map((strength, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2" />
                      <span className="text-sm text-muted-foreground">
                        {strength}
                      </span>
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Areas to Improve
                  </h3>
                </div>
                <ul className="space-y-3">
                  {resumeData.improvements.map((improvement, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-2" />
                      <span className="text-sm text-muted-foreground">
                        {improvement}
                      </span>
                    </li>
                  ))}
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
                  <h3 className="text-lg font-semibold text-foreground">
                    AI Recommendation
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Based on your resume analysis, you have a strong technical
                    foundation with excellent experience in data science. I
                    recommend focusing on behavioral questions about leadership
                    and team collaboration during your interview practice. Your
                    quantified achievements are impressive - be ready to discuss
                    them in detail.
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

      <UserStatus userName="John" onLogout={() => navigate("/login")} />
    </div>
  )
}
