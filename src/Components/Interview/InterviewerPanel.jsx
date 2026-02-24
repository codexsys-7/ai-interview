// Phase 1.3: Updated with audio feedback and improved question display
import { useState, useEffect, useRef, useMemo } from "react";
import { UserCircle2, ShieldCheck, Volume2, VolumeX } from "lucide-react";

export default function InterviewerPanel({
  currentQuestion,
  questionNumber,
  totalQuestions,
  interviewer,
  type,
  isPlaying = false,
  audioUrl = null,
}) {
  // Determine badge color based on question type
  const typeBadge = useMemo(() => {
    const badges = {
      standard: { bg: "bg-gray-100", text: "text-gray-700", label: "General" },
      follow_up: { bg: "bg-blue-50", text: "text-blue-700", label: "Follow-up" },
      challenge: { bg: "bg-orange-50", text: "text-orange-700", label: "Clarification" },
      deep_dive: { bg: "bg-purple-50", text: "text-purple-700", label: "Deep Dive" },
      reference: { bg: "bg-green-50", text: "text-green-700", label: "Connected" },
      technical: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Technical" },
      behavioral: { bg: "bg-teal-50", text: "text-teal-700", label: "Behavioral" },
    };
    return badges[type] || badges.standard;
  }, [type]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="px-2 py-1 rounded bg-gray-100 font-medium">
            Q{questionNumber} / {totalQuestions}
          </span>
          <span className="text-gray-300">•</span>
          <span className={`px-2 py-1 rounded ${typeBadge.bg} ${typeBadge.text} flex items-center gap-1`}>
            <ShieldCheck className="w-4 h-4" />
            {typeBadge.label}
          </span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs">
          <UserCircle2 className="w-4 h-4" />
          {interviewer || "Interviewer"}
        </div>
      </div>

      <div className={`rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-900 aspect-video flex items-center justify-center relative ${isPlaying ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}>
        {/* Speaking indicator overlay */}
        {isPlaying && (
          <div className="absolute top-3 right-3 flex items-center gap-2 px-2 py-1 bg-white/20 backdrop-blur-sm rounded-full">
            <div className="flex gap-0.5 items-end h-4">
              <div className="w-1 bg-white rounded-full animate-bounce" style={{ height: '8px', animationDelay: '0ms' }} />
              <div className="w-1 bg-white rounded-full animate-bounce" style={{ height: '12px', animationDelay: '150ms' }} />
              <div className="w-1 bg-white rounded-full animate-bounce" style={{ height: '6px', animationDelay: '300ms' }} />
              <div className="w-1 bg-white rounded-full animate-bounce" style={{ height: '10px', animationDelay: '450ms' }} />
            </div>
            <span className="text-white text-xs">Speaking</span>
          </div>
        )}

        {/* Placeholder avatar area */}
        <div className="text-center">
          <div className={`mx-auto w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-3 transition-all duration-300 ${isPlaying ? 'animate-pulse ring-4 ring-blue-400/30' : ''}`}>
            <UserCircle2 className="w-10 h-10 text-white/80" />
          </div>
          <p className="text-white/80 text-sm">
            {isPlaying ? "AI Interviewer is speaking..." : "Avatar panel - arriving soon with fully animated interviewers."}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Question</h3>
          {isPlaying && (
            <div className="flex items-center gap-1 text-blue-600">
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span className="text-xs">Playing</span>
            </div>
          )}
        </div>
        <p className={`text-gray-800 leading-relaxed ${isPlaying ? 'animate-fade-in' : ''}`}>
          {currentQuestion}
        </p>
      </div>
    </div>
  );
}
