import { useState, useEffect, useRef, useMemo } from "react";
import { MessageSquare } from "lucide-react";

export default function TranscriptBox({ transcript, onTranscriptChange, isRecording }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-gray-700" />
        <h3 className="text-lg font-semibold text-gray-900">Your Answer</h3>
        {isRecording && (
          <span className="ml-auto text-sm text-red-600 font-medium flex items-center gap-1">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" />
            Recording...
          </span>
        )}
      </div>

      <textarea
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
        placeholder="Your answer will appear here as you speak... (or type to simulate)"
        className="w-full h-48 p-4 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
      />

      <div className="mt-2 text-sm text-gray-500">
        💡 Tip: Be clear, concise, and structure your answer with examples
      </div>
    </div>
  );
}