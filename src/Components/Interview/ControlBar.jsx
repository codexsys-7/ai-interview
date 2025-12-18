// This is my Final Version working on MVP.

import { Timer, RotateCcw, ChevronRight, Flag, Mic } from "lucide-react";

export default function ControlBar({
  isRecording,
  isTranscribing,
  canRepeat,
  canGoNext,
  onStartThinkTime,
  onRepeatQuestion,
  onNextQuestion,
  onEndInterview,
  showThinkTime,
  transcript,
}) {
  return (
    <div className="sticky bottom-4">
      <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Left controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStartThinkTime}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-gray-700 hover:bg-gray-50"
            title={
              showThinkTime
                ? "Thinking time in progress…"
                : "Start a 5-second prep timer."
            }
          >
            <Timer className="w-4 h-4" />
            Timer
          </button>

          <button
            type="button"
            onClick={onRepeatQuestion}
            disabled={!canRepeat}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${
              canRepeat
                ? "text-gray-700 hover:bg-gray-50"
                : "text-gray-400 cursor-not-allowed"
            }`}
            title="Repeat question (max 2x)"
          >
            <RotateCcw className="w-4 h-4" />
            Repeat
          </button>
        </div>

        {/* Center status (no Start/Stop buttons anymore) */}
        <div className="flex items-center gap-2 text-sm">
          {isRecording ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700">
              <Mic className="w-3 h-3" />
              Recording your answer…
            </span>
          ) : isTranscribing ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              Transcribing your answer…
            </span>
          ) : transcript ? (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
              Answer saved
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-gray-600">
              Ready for the next question
            </span>
          )}
        </div>

        {/* Right nav controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNextQuestion}
            disabled={!canGoNext || isTranscribing}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${
              canGoNext && !isTranscribing
                ? "text-gray-700 hover:bg-gray-50"
                : "text-gray-400 cursor-not-allowed"
            }`}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onEndInterview}
            disabled={isTranscribing}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 ${
              isTranscribing ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <Flag className="w-4 h-4" />
            End Interview
          </button>
        </div>
      </div>

      {/* tiny status row */}
      <div className="text-xs text-gray-500 mt-2 px-1">
        {isRecording
          ? "Recording… speak clearly."
          : isTranscribing
          ? "Transcribing your answer…"
          : transcript
          ? "Transcript locked in."
          : "Ready."}
      </div>
    </div>
  );
}
