import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Upload, FileText, Sparkles, ArrowRight, History, Target, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GlassCard } from "@/components/glass-card"
import { GlowingOrb } from "@/components/glowing-orb"
import { UserStatus } from "@/components/user-status"
import { cn } from "@/lib/utils"
import { apiParseResume } from "@/api/client"

export default function HomePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type === "application/pdf") {
      handleFileUpload(files[0])
    }
  }

  const handleFileUpload = async (file) => {
    setUploadedFile(file)
    setIsUploading(true)
    setUploadError("")
    try {
      const result = await apiParseResume(file)
      const resumeData = { ...result, fileName: file.name }
      localStorage.setItem("resumeData", JSON.stringify(resumeData))
      navigate("/resume-analysis", { state: { resumeData } })
    } catch (err) {
      setUploadError(err.message || "Failed to analyze resume. Please try again.")
      setUploadedFile(null)
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileSelect = (e) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 py-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 mb-12">
          <div className="flex justify-center mb-8">
            <GlowingOrb size="lg" isSpeaking={true} />
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-foreground text-balance">
            Master Your Next{" "}
            <span className="text-primary glow-text">Interview</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            Upload your resume and let our AI analyze it, then practice with realistic
            interview simulations tailored to your experience
          </p>
        </div>

        {/* Upload Section */}
        <div className="w-full max-w-2xl mb-16">
          {uploadError && (
            <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive text-center">
              {uploadError}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "glass-card rounded-3xl p-12 cursor-pointer transition-all duration-300",
              "border-2 border-dashed",
              isDragging
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-border hover:border-primary/50",
              isUploading && "pointer-events-none"
            )}
          >
            <div className="flex flex-col items-center text-center space-y-6">
              {isUploading ? (
                <>
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-foreground">Uploading Resume...</h3>
                    <p className="text-muted-foreground">
                      {uploadedFile?.name}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center float-animation">
                    <Upload className="w-10 h-10 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-semibold text-foreground">Upload Your Resume</h3>
                    <p className="text-muted-foreground">
                      Drag and drop your PDF here, or click to browse
                    </p>
                  </div>
                  <Button
                    className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-8 h-12 font-semibold glow-border"
                  >
                    <FileText className="w-5 h-5 mr-2" />
                    Select Resume
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Supported format: PDF (Max 10MB)
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-6 w-full max-w-4xl">
          <GlassCard hover className="group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">AI Analysis</h3>
              <p className="text-muted-foreground text-sm">
                Get instant insights on your resume strengths and areas for improvement
              </p>
            </div>
          </GlassCard>

          <GlassCard hover className="group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Smart Questions</h3>
              <p className="text-muted-foreground text-sm">
                Practice with questions tailored to your experience and target role
              </p>
            </div>
          </GlassCard>

          <GlassCard hover className="group">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Real Feedback</h3>
              <p className="text-muted-foreground text-sm">
                Receive detailed feedback and scoring after each interview session
              </p>
            </div>
          </GlassCard>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap justify-center gap-4 mt-12">
          <Button
            variant="outline"
            onClick={() => navigate("/interview")}
            className="rounded-xl border-border hover:border-primary/50 hover:bg-secondary h-11 px-6"
          >
            <History className="w-4 h-4 mr-2" />
            View Past Interviews
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/interview")}
            className="rounded-xl border-border hover:border-primary/50 hover:bg-secondary h-11 px-6"
          >
            Quick Practice
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* User Status */}
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
