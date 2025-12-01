import { useState, useEffect, useRef, useMemo } from "react";
import { Copy, Mic, Pause } from "lucide-react";

// TranscriptPanel.jsx
export default function TranscriptPanel({
  transcript,
  isRecording,
  isTranscribing,
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">
          Your answer (live transcript)
        </h3>
        <span className="text-xs text-gray-500">
          {isRecording
            ? "Listening.... speak clearly"
            : isTranscribing
            ? "Transcribing your answer…"
            : "Not recording"}
        </span>
      </div>
      <div className="min-h-[96px] border border-gray-200 rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap bg-gray-50">
        {transcript ||
          (!isRecording && !isTranscribing
            ? "Your words will appear here as you speak."
            : "")}
      </div>
    </div>
  );
}
