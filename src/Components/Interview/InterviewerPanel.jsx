import { useState, useEffect, useRef, useMemo } from "react";
import { UserCircle2, ShieldCheck } from "lucide-react";

export default function InterviewerPanel({
  currentQuestion,
  questionNumber,
  totalQuestions,
  interviewer,
  type,
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="px-2 py-1 rounded bg-gray-100">
            Q{questionNumber} / {totalQuestions}
          </span>
          <span className="text-gray-300">•</span>
          <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4" />
            {type || "General"}
          </span>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs">
          <UserCircle2 className="w-4 h-4" />
          {interviewer || "Interviewer"}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-gradient-to-br from-slate-900 to-indigo-900 aspect-video flex items-center justify-center">
        {/* Placeholder avatar area */}
        <div className="text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-3">
            <UserCircle2 className="w-10 h-10 text-white/80" />
          </div>
          <p className="text-white/80 text-sm">Avatar space (coming soon)</p>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Question</h3>
        <p className="text-gray-800 leading-relaxed">{currentQuestion}</p>
      </div>
    </div>
  );
}
