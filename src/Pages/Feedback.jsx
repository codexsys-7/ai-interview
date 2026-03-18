import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Download, ArrowRight, Trophy, Target, MessageSquare,
  Lightbulb, TrendingUp, TrendingDown, Clock, Award,
  CheckCircle2, AlertCircle, Star, RefreshCw
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"
import { cn } from "@/lib/utils"
import { apiScoreInterview } from "@/api/client"

// Convert 0-5 score to 0-100
const toPercent = (v) => Math.round((parseFloat(v) || 0) * 20)

function mapFeedbackData(resp, sessionData) {
  const overall = resp.overall || {}
  const questions = resp.questions || []

  const overallScore = Math.round(parseFloat(overall.overallScore) || 0)

  // Map individual question scores (avg of 0-5 fields → 0-100)
  const questionScores = questions.map((q) => {
    const scores = q.scores || {}
    const avg = Object.values(scores).reduce((a, b) => a + parseFloat(b || 0), 0) / Math.max(Object.keys(scores).length, 1)
    return {
      question: q.prompt || "Question",
      score: toPercent(avg),
      feedback: (q.strengths || [])[0] || "Good response.",
    }
  })

  // Category scores from aggregated question scores
  const avgScore = (key) => {
    if (questions.length === 0) return 75
    return Math.round(
      questions.reduce((sum, q) => sum + toPercent(q.scores?.[key] || 3), 0) / questions.length
    )
  }

  const categories = [
    { name: "Communication",       score: avgScore("clarity"),    icon: MessageSquare, trend: "up" },
    { name: "Technical Knowledge", score: avgScore("content"),    icon: Target,        trend: "up" },
    { name: "Problem Solving",     score: avgScore("structure"),  icon: Lightbulb,     trend: "neutral" },
    { name: "Confidence",          score: avgScore("confidence"), icon: Trophy,        trend: "up" },
  ]

  const strengths = (overall.strengths || []).slice(0, 3).map((title, i) => ({
    title: typeof title === "string" ? title : `Strength ${i + 1}`,
    description: "",
  }))

  const improvements = (overall.improvements || []).slice(0, 3).map((title, i) => ({
    title: typeof title === "string" ? title : `Improvement ${i + 1}`,
    description: "",
  }))

  const now = new Date()
  return {
    overallScore,
    duration: "--:--",
    questionsAnswered: questions.length,
    date: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    categories,
    strengths,
    improvements,
    questionScores,
    summary: overall.summary || "",
  }
}

export default function FeedbackPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [feedbackData, setFeedbackData] = useState(null)
  const [loadError, setLoadError] = useState("")

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem("interviewSession") || "null")
    if (!stored?.answeredQuestions?.length) {
      setLoadError("No interview data found. Please complete an interview first.")
      setIsLoading(false)
      return
    }

    const { role, difficulty, answeredQuestions } = stored

    apiScoreInterview({
      role: role || "Software Engineer",
      difficulty: difficulty || "medium",
      answers: answeredQuestions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        interviewer: q.interviewer || "AI Interviewer",
        type: q.type || "behavioral",
        userAnswer: q.userAnswer,
        idealAnswer: q.idealAnswer || null,
      })),
    })
      .then((resp) => {
        setFeedbackData(mapFeedbackData(resp, stored))
      })
      .catch((err) => {
        setLoadError(err.message || "Failed to score interview.")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const handleDownload = async () => {
    setIsDownloading(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsDownloading(false)
    alert("Download feature coming soon!")
  }

  const getScoreColor = (score) => {
    if (score >= 85) return "text-green-500"
    if (score >= 70) return "text-yellow-500"
    return "text-orange-500"
  }

  const getScoreLabel = (score) => {
    if (score >= 90) return "Excellent"
    if (score >= 80) return "Very Good"
    if (score >= 70) return "Good"
    if (score >= 60) return "Fair"
    return "Needs Work"
  }

  const userName = JSON.parse(localStorage.getItem("user") || "{}").full_name || "User"

  if (isLoading) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <div className="text-center space-y-6">
          <GlowingOrb size="xl" isSpeaking={true} />
          <h2 className="text-3xl font-bold text-foreground">Scoring Your Interview...</h2>
          <p className="text-muted-foreground">AI is analyzing your responses</p>
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen gradient-mesh flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          <GlowingOrb size="lg" />
          <h2 className="text-2xl font-bold text-foreground">Unable to Load Feedback</h2>
          <p className="text-muted-foreground">{loadError}</p>
          <Button
            onClick={() => navigate("/interview")}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-12 px-8 font-semibold"
          >
            Start New Interview
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen gradient-mesh relative pb-24">
      {/* Background */}
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 container mx-auto px-6 py-12 max-w-6xl">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <div className="flex justify-center">
            <GlowingOrb size="lg" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-6">
            Interview <span className="text-primary glow-text">Complete</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Here&apos;s your detailed performance analysis
          </p>
        </div>

        {/* Overall Score Card */}
        <div className="mb-10">
          <GlassCard className="border-primary/30">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Score Circle */}
              <div className="relative w-48 h-48 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle cx="96" cy="96" r="85" stroke="currentColor" strokeWidth="14" fill="none" className="text-muted" />
                  <circle
                    cx="96" cy="96" r="85"
                    stroke="currentColor" strokeWidth="14" fill="none"
                    strokeDasharray={534}
                    strokeDashoffset={534 - (534 * feedbackData.overallScore) / 100}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-1000 ease-out"
                    style={{ filter: "drop-shadow(0 0 15px var(--glow-primary))" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold text-primary">{feedbackData.overallScore}</span>
                  <span className="text-sm text-muted-foreground">out of 100</span>
                </div>
              </div>

              {/* Score Details */}
              <div className="flex-1 space-y-4 text-center md:text-left">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-foreground flex items-center justify-center md:justify-start gap-2">
                    <Award className="w-6 h-6 text-primary" />
                    {getScoreLabel(feedbackData.overallScore)} Performance
                  </h2>
                  {feedbackData.summary && (
                    <p className="text-muted-foreground">{feedbackData.summary}</p>
                  )}
                </div>

                <div className="flex flex-wrap justify-center md:justify-start gap-6 pt-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Duration: {feedbackData.duration}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{feedbackData.questionsAnswered} Questions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{feedbackData.date}</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Category Scores */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {feedbackData.categories.map((category) => (
            <GlassCard key={category.name} hover>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <category.icon className="w-5 h-5 text-primary" />
                  </div>
                  {category.trend === "up" && <TrendingUp className="w-4 h-4 text-green-500" />}
                  {category.trend === "down" && <TrendingDown className="w-4 h-4 text-red-500" />}
                </div>
                <div>
                  <h3 className="text-sm text-muted-foreground">{category.name}</h3>
                  <p className={cn("text-2xl font-bold", getScoreColor(category.score))}>{category.score}%</p>
                </div>
                <Progress value={category.score} className="h-1.5 bg-muted" />
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Strengths & Improvements */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          <GlassCard>
            <div className="flex items-center gap-2 mb-6">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <h3 className="text-xl font-semibold text-foreground">Your Strengths</h3>
            </div>
            <div className="space-y-4">
              {feedbackData.strengths.map((strength, index) => (
                <div key={index} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-green-500">{index + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{strength.title}</h4>
                    {strength.description && (
                      <p className="text-sm text-muted-foreground mt-1">{strength.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center gap-2 mb-6">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              <h3 className="text-xl font-semibold text-foreground">Areas to Improve</h3>
            </div>
            <div className="space-y-4">
              {feedbackData.improvements.map((improvement, index) => (
                <div key={index} className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-yellow-500">{index + 1}</span>
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{improvement.title}</h4>
                    {improvement.description && (
                      <p className="text-sm text-muted-foreground mt-1">{improvement.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Question-by-Question Breakdown */}
        {feedbackData.questionScores.length > 0 && (
          <GlassCard className="mb-10">
            <h3 className="text-xl font-semibold text-foreground mb-6">Question-by-Question Analysis</h3>
            <div className="space-y-4">
              {feedbackData.questionScores.map((item, index) => (
                <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-muted/30">
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                    item.score >= 85 ? "bg-green-500/20" : item.score >= 70 ? "bg-yellow-500/20" : "bg-orange-500/20"
                  )}>
                    <span className={cn("text-lg font-bold", getScoreColor(item.score))}>{item.score}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground">Q{index + 1}: {item.question}</h4>
                    <p className="text-sm text-muted-foreground mt-1">{item.feedback}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            variant="outline"
            size="lg"
            className="rounded-xl border-border hover:border-primary/50 h-14 px-8 font-semibold"
          >
            {isDownloading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Generating PDF...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5" />
                Download Report
              </div>
            )}
          </Button>

          <Button
            onClick={() => navigate("/interview")}
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-8 font-semibold glow-border"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Start Next Interview
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
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
