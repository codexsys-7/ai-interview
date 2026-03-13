import { cn } from "@/lib/utils"

export function GlassCard({ children, className, hover = false }) {
  return (
    <div
      className={cn(
        "glass-card rounded-2xl p-6",
        hover && "transition-glow cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  )
}
