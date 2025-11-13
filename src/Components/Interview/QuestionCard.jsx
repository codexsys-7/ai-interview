import { useState, useEffect, useRef, useMemo } from "react";
import { Play, Square, ArrowRight, X, Timer } from "lucide-react";

export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  timer,
  isRecording,
  onStartStop,
  onNext,
  onEnd,
  canGoNext
}) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">
            Q{questionNumber}/{totalQuestions}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-700">
          <Timer className="w-5 h-5" />
          <span className="font-mono text-lg font-semibold">{timer}</span>
        </div>
      </div>

      {/* Question */}
      <div className="mb-8">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed">
          {question}
        </h2>
      </div>

      {/* Controls */}
      <div className="space-y-3">
        {/* Start/Stop Recording */}
        <button
          onClick={onStartStop}
          className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-3 ${
            isRecording
              ? "bg-red-500 hover:bg-red-600 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
        >
          {isRecording ? (
            <>
              <Square className="w-5 h-5 fill-current" />
              Stop Recording
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              Start Recording
            </>
          )}
        </button>

        {/* Next/End Buttons */}
        <div className="flex gap-3">
          {canGoNext && (
            <button
              onClick={onNext}
              className="flex-1 py-3 px-6 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              Next Question
              <ArrowRight className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={onEnd}
            className="flex-1 py-3 px-6 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
          >
            End Interview
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}