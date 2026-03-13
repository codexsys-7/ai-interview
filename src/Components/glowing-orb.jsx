"use client"

import { cn } from "@/lib/utils"

export function GlowingOrb({ isSpeaking = false, size = "md", className }) {
  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-24 h-24",
    lg: "w-32 h-32",
    xl: "w-48 h-48",
  }

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {/* Outer glow rings */}
      <div
        className={cn(
          "absolute rounded-full bg-primary/10 blur-xl transition-all duration-500",
          sizeClasses[size],
          isSpeaking && "scale-150 bg-primary/20"
        )}
      />
      <div
        className={cn(
          "absolute rounded-full bg-primary/20 blur-lg transition-all duration-300",
          size === "sm" && "w-12 h-12",
          size === "md" && "w-20 h-20",
          size === "lg" && "w-28 h-28",
          size === "xl" && "w-40 h-40",
          isSpeaking && "scale-125"
        )}
      />

      {/* Main orb */}
      <div
        className={cn(
          "relative rounded-full bg-gradient-to-br from-primary via-accent to-primary/80",
          sizeClasses[size],
          isSpeaking && "orb-speaking"
        )}
      >
        {/* Inner shine */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-white/30 to-transparent" />

        {/* Center glow */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={cn(
              "rounded-full bg-white/40 blur-sm",
              size === "sm" && "w-4 h-4",
              size === "md" && "w-6 h-6",
              size === "lg" && "w-8 h-8",
              size === "xl" && "w-12 h-12"
            )}
          />
        </div>
      </div>

      {/* Speaking indicator waves */}
      {isSpeaking && (
        <>
          <div
            className={cn(
              "absolute rounded-full border-2 border-primary/40 animate-ping",
              size === "sm" && "w-20 h-20",
              size === "md" && "w-32 h-32",
              size === "lg" && "w-40 h-40",
              size === "xl" && "w-56 h-56"
            )}
            style={{ animationDuration: "2s" }}
          />
          <div
            className={cn(
              "absolute rounded-full border border-primary/20 animate-ping",
              size === "sm" && "w-24 h-24",
              size === "md" && "w-40 h-40",
              size === "lg" && "w-48 h-48",
              size === "xl" && "w-64 h-64"
            )}
            style={{ animationDuration: "2.5s", animationDelay: "0.5s" }}
          />
        </>
      )}
    </div>
  )
}
