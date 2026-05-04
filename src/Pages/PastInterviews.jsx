import { History, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { GlassCard } from "@/components/glass-card"

export default function PastInterviewsPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen gradient-mesh relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-lg text-center">
        <GlassCard>
          <div className="relative flex flex-col items-center space-y-6 py-8">
            <button
              onClick={() => navigate(-1)}
              className="absolute top-0 right-0 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Go back"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <History className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-bold text-foreground">Past Interviews</h1>
              <p className="text-muted-foreground">
                Coming Soon — your interview history will appear here.
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  )
}
