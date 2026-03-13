import { useState } from "react"
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

// Mock feedback data
const feedbackData = {
  overallScore: 82,
  duration: "18:45",
  questionsAnswered: 5,
  date: "March 11, 2026",
  categories: [
    { name: "Communication", score: 88, icon: MessageSquare, trend: "up" },
    { name: "Technical Knowledge", score: 85, icon: Target, trend: "up" },
    { name: "Problem Solving", score: 78, icon: Lightbulb, trend: "neutral" },
    { name: "Confidence", score: 80, icon: Trophy, trend: "up" },
  ],
  strengths: [
    {
      title: "Clear Communication",
      description: "You explained complex concepts in an understandable way, using relevant examples.",
    },
    {
      title: "Strong Technical Foundation",
      description: "Demonstrated solid knowledge of data science fundamentals and machine learning concepts.",
    },
    {
      title: "Structured Responses",
      description: "Your answers followed a logical structure, making them easy to follow.",
    },
  ],
  improvements: [
    {
      title: "Add More Specific Examples",
      description: "Consider including more quantified results from your projects (e.g., 'improved accuracy by 15%').",
    },
    {
      title: "Reduce Filler Words",
      description: "Work on reducing 'um' and 'uh' by pausing briefly instead while collecting your thoughts.",
    },
    {
      title: "Elaborate on Leadership",
      description: "When discussing team projects, highlight your specific leadership contributions more clearly.",
    },
  ],
  questionScores: [
    { question: "Tell me about yourself", score: 85, feedback: "Strong opening, good overview of experience" },
    { question: "Career motivations", score: 88, feedback: "Authentic and well-articulated passion" },
    { question: "Challenging project", score: 78, feedback: "Good example, could use more specific metrics" },
    { question: "Staying updated", score: 82, feedback: "Showed continuous learning mindset" },
    { question: "Explaining to stakeholders", score: 80, feedback: "Clear approach, add more concrete examples" },
  ],
}

export default function FeedbackPage() {
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    setIsDownloading(false)
    alert("Feedback report downloaded!")
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
                  <circle
                    cx="96"
                    cy="96"
                    r="85"
                    stroke="currentColor"
                    strokeWidth="14"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="96"
                    cy="96"
                    r="85"
                    stroke="currentColor"
                    strokeWidth="14"
                    fill="none"
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
                  <p className="text-muted-foreground">
                    You performed better than 78% of candidates in similar interviews
                  </p>
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
                  <p className={cn("text-2xl font-bold", getScoreColor(category.score))}>
                    {category.score}%
                  </p>
                </div>
                <Progress value={category.score} className="h-1.5 bg-muted" />
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Strengths & Improvements */}
        <div className="grid lg:grid-cols-2 gap-6 mb-10">
          {/* Strengths */}
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
                    <p className="text-sm text-muted-foreground mt-1">{strength.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Improvements */}
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
                    <p className="text-sm text-muted-foreground mt-1">{improvement.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Question-by-Question Breakdown */}
        <GlassCard className="mb-10">
          <h3 className="text-xl font-semibold text-foreground mb-6">Question-by-Question Analysis</h3>
          <div className="space-y-4">
            {feedbackData.questionScores.map((item, index) => (
              <div key={index} className="flex items-start gap-4 p-4 rounded-xl bg-muted/30">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                  item.score >= 85 ? "bg-green-500/20" : item.score >= 70 ? "bg-yellow-500/20" : "bg-orange-500/20"
                )}>
                  <span className={cn("text-lg font-bold", getScoreColor(item.score))}>
                    {item.score}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground">Q{index + 1}: {item.question}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{item.feedback}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

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

      <UserStatus userName="John" onLogout={() => navigate("/login")} />
    </div>
  )
}
