import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Sparkles, FileText, ArrowRight, Clock, Target,
  MessageSquare, Briefcase, CheckCircle2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"
import { cn } from "@/lib/utils"

export default function InterviewPage() {
  const navigate = useNavigate()
  const [selectedType, setSelectedType] = useState(null)
  const [jobDescription, setJobDescription] = useState("")
  const [isStarting, setIsStarting] = useState(false)

  const handleStartInterview = async () => {
    setIsStarting(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    navigate("/interview/arena")
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-12">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <GlowingOrb size="lg" isSpeaking={!selectedType} />
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mt-8">
            Choose Your <span className="text-primary glow-text">Interview</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl">
            Select the type of interview practice that best suits your preparation needs
          </p>
        </div>

        {/* Interview Type Selection */}
        <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 mb-8">
          {/* General Interview */}
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
                    <span className="text-sm text-muted-foreground">15-20 minutes</span>
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

          {/* Job Description Based */}
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
                    <span className="text-sm text-muted-foreground">20-30 minutes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">12-15 questions</span>
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

        {/* Job Description Input */}
        {selectedType === "job-description" && (
          <div className="w-full max-w-4xl mb-8">
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

        {/* Start Button */}
        <Button
          onClick={handleStartInterview}
          disabled={!selectedType || (selectedType === "job-description" && !jobDescription.trim()) || isStarting}
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl h-14 px-12 font-semibold text-lg glow-border disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
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
        <div className="mt-12 w-full max-w-2xl">
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

      <UserStatus userName="John" onLogout={() => navigate("/login")} />
    </div>
  )
}
