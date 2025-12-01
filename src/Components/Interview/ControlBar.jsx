// This is my Final Version working on MVP.

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Timer,
  RotateCcw,
  Mic,
  Square,
  ChevronRight,
  Flag,
} from "lucide-react";

export default function ControlBar({
  isRecording,
  canRepeat,
  canGoNext,
  onStartThinkTime,
  onStartRecording,
  onStopRecording,
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
                ? "Thinking time in progress...."
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

        {/* Center mic controls */}
        <div className="flex items-center gap-2">
          {!isRecording ? (
            <button
              type="button"
              onClick={onStartRecording}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <Mic className="w-4 h-4" />
              Start Recording
            </button>
          ) : (
            <button
              type="button"
              onClick={onStopRecording}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>

        {/* Right nav controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNextQuestion}
            disabled={!canGoNext}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${
              canGoNext
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700"
          >
            <Flag className="w-4 h-4" />
            End Interview
          </button>
        </div>
      </div>

      {/* tiny status row */}
      <div className="text-xs text-gray-500 mt-2 px-1">
        {isRecording
          ? "Recording....Capturing your response in real time."
          : transcript
          ? "Transcript locked in."
          : "Ready."}
      </div>
    </div>
  );
}
