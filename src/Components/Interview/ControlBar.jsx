// Phase 1.3: Updated with intelligent question loading state and audio controls

import { Timer, RotateCcw, ChevronRight, Flag, Mic, Sparkles, Volume2, VolumeX } from "lucide-react";

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
  isLoadingQuestion = false,
  isAISpeaking = false,
  awaitingFollowUp = false,
}) {
  // Determine the main status to display
  const getStatusDisplay = () => {
    if (isAISpeaking) {
      return {
        className: "bg-blue-50 border-blue-200 text-blue-700",
        icon: <Volume2 className="w-3 h-3 animate-pulse" />,
        text: "AI is speaking..."
      };
    }
    if (isLoadingQuestion) {
      return {
        className: "bg-indigo-50 border-indigo-200 text-indigo-700",
        icon: <Sparkles className="w-3 h-3 animate-pulse" />,
        text: "AI is thinking..."
      };
    }
    if (awaitingFollowUp) {
      return {
        className: "bg-yellow-50 border-yellow-200 text-yellow-700",
        icon: <Mic className="w-3 h-3" />,
        text: "Please elaborate on your answer"
      };
    }
    if (isRecording) {
      return {
        className: "bg-rose-50 border-rose-200 text-rose-700",
        icon: <Mic className="w-3 h-3" />,
        text: "Recording your answer..."
      };
    }
    if (isTranscribing) {
      return {
        className: "bg-amber-50 border-amber-200 text-amber-700",
        icon: null,
        text: "Transcribing your answer..."
      };
    }
    if (transcript) {
      return {
        className: "bg-emerald-50 border-emerald-200 text-emerald-700",
        icon: null,
        text: "Answer saved"
      };
    }
    return {
      className: "bg-gray-50 border-gray-200 text-gray-600",
      icon: null,
      text: "Ready for the next question"
    };
  };

  const status = getStatusDisplay();

  // Determine if controls should be disabled
  const controlsDisabled = isTranscribing || isLoadingQuestion || isAISpeaking;

  return (
    <div className="sticky bottom-4">
      <div className="bg-white/90 backdrop-blur rounded-2xl shadow-xl border border-gray-200 p-4 flex flex-wrap items-center justify-between gap-3">
        {/* Left controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStartThinkTime}
            disabled={controlsDisabled}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              controlsDisabled
                ? "text-gray-400 cursor-not-allowed"
                : "text-gray-700 hover:bg-gray-50"
            }`}
            title={
              showThinkTime
                ? "Thinking time in progress…"
                : "Start a 3-second prep timer."
            }
          >
            <Timer className="w-4 h-4" />
            Timer
          </button>

          <button
            type="button"
            onClick={onRepeatQuestion}
            disabled={!canRepeat || controlsDisabled}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
              canRepeat && !controlsDisabled
                ? "text-gray-700 hover:bg-gray-50"
                : "text-gray-400 cursor-not-allowed"
            }`}
            title="Repeat question (max 2x)"
          >
            <RotateCcw className="w-4 h-4" />
            Repeat
          </button>
        </div>

        {/* Center status */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${status.className}`}>
            {status.icon}
            {status.text}
          </span>
        </div>

        {/* Right nav controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNextQuestion}
            disabled={!canGoNext || controlsDisabled}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
              canGoNext && !controlsDisabled
                ? "text-gray-700 hover:bg-gray-50"
                : "text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLoadingQuestion ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onEndInterview}
            disabled={controlsDisabled}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 transition-colors ${
              controlsDisabled ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <Flag className="w-4 h-4" />
            End Interview
          </button>
        </div>
      </div>

      {/* Status row */}
      <div className="text-xs text-gray-500 mt-2 px-1 flex items-center justify-between">
        <span>
          {isAISpeaking
            ? "AI is speaking... Press Esc to skip."
            : isLoadingQuestion
            ? "AI is preparing your next question..."
            : awaitingFollowUp
            ? "Please provide more details about your answer."
            : isRecording
            ? "Recording... speak clearly."
            : isTranscribing
            ? "Transcribing your answer..."
            : transcript
            ? "Transcript locked in."
            : "Ready."}
        </span>
        <span className="text-gray-400">
          Shift+Space: Toggle audio | Esc: Skip
        </span>
      </div>
    </div>
  );
}
