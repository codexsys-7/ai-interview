// This is my Third Version with no Evaluate button, no evaluate prop.

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
            title={showThinkTime ? "Think timer running" : "Start 10s think timer"}
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
          ? "Recording… your speech-to-text transcript will be saved with this question."
          : transcript
          ? "Transcript captured."
          : "Ready."}
      </div>
    </div>
  );
}






// This is my Second version with No Evaluate and Start Recording button.


// import React, { useState, useEffect, useRef, useMemo } from "react";
// import {
//   Timer as TimerIcon,
//   Repeat2,
//   SkipForward,
//   CheckCircle2,
//   Square,
//   Mic,
//   Flag
// } from "lucide-react";

// export default function ControlBar({
//   isRecording,
//   canRepeat,
//   canGoNext,
//   onStartThinkTime,
//   onStopRecording,
//   onRepeatQuestion,
//   onNextQuestion,
//   onEndInterview,
//   showThinkTime,
//   transcript,
// }) {
//   return (
//     <div className="bg-white rounded-xl shadow-lg p-4 flex flex-wrap gap-3 items-center justify-between">
//       <div className="flex gap-3">
        
//         <button
//           type="button"
//           onClick={onStartThinkTime}
//           disabled={showThinkTime || isRecording}
//           className={`px-4 py-2 rounded-lg font-medium ${
//             showThinkTime || isRecording
//               ? "bg-gray-200 text-gray-500 cursor-not-allowed"
//               : "bg-indigo-600 text-white hover:bg-indigo-700"
//           }`}
//           title={showThinkTime ? "Timer running" : "Start 10s think time"}
//         >
//           Start Timer
//         </button>


//         {/* Repeat Question Button(Max 2 times) */}
//         <button
//           type="button"
//           onClick={onRepeatQuestion}
//           disabled={!canRepeat}
//           className={`px-4 py-2 rounded-lg font-medium ${
//             canRepeat ? "bg-white border hover:bg-gray-50" : "bg-gray-200 text-gray-500 cursor-not-allowed"
//           }`}
//           title="Repeat question (max 2)"
//         >
//           Repeat Question
//         </button>

//         {/* Stop while recording (auto-start is handled after timer) */}
//         {isRecording && (
//           <button
//             type="button"
//             onClick={onStopRecording}
//             className="px-4 py-2 rounded-lg font-medium bg-white border hover:bg-gray-50"
//           >
//             Stop Recording
//           </button>
//         )}
//       </div>


//       {/* Next Question Button*/}
//       <div className="flex gap-3">
//         <button
//           type="button"
//           onClick={onNextQuestion}
//           disabled={!canGoNext}
//           className={`px-4 py-2 rounded-lg font-semibold ${
//             canGoNext ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-gray-200 text-gray-500 cursor-not-allowed"
//           }`}
//         >
//           Next Question
//         </button>
        
//         {/* End Interview Button */}
//         <button
//           type="button"
//           onClick={onEndInterview}
//           className="px-4 py-2 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700"
//         >
//           End Interview
//         </button>
//       </div>
//     </div>
//   );





// This is my First Version COntrolbar, with Evaluate each question and Start Recording Button.

// import React from "react";
// import {
//   Timer as TimerIcon,
//   Repeat2,
//   SkipForward,
//   CheckCircle2,
//   Square,
//   Mic,
//   Flag
// } from "lucide-react";

// export default function ControlBar({
//   isRecording,
//   hasEvaluation,
//   canRepeat,
//   canGoNext,
//   onStartThinkTime,
//   onStartRecording,
//   onStopRecording,
//   onRepeatQuestion,
//   onEvaluate,
//   onNextQuestion,
//   onEndInterview,
//   showThinkTime,
//   transcript,
// }) {
//   return (
//     <div className="sticky bottom-0 z-40 bg-white/85 backdrop-blur border-t border-gray-200">
//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
//         {/* Timer */}
//         <button
//           type="button"
//           onClick={onStartThinkTime}
//           className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 ${
//             showThinkTime ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white"
//           }`}
//           title="Show think timer"
//         >
//           <TimerIcon className="w-4 h-4" />
//           Timer
//         </button>

//         {/* Repeat (max 2) */}
//         <button
//           type="button"
//           onClick={onRepeatQuestion}
//           disabled={!canRepeat}
//           className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 disabled:opacity-50"
//           title="Repeat the question (max 2)"
//         >
//           <Repeat2 className="w-4 h-4" />
//           Repeat Question
//         </button>

//         {/* Recording */}
//         {!isRecording ? (
//           <button
//             type="button"
//             onClick={onStartRecording}
//             className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow"
//           >
//             <Mic className="w-4 h-4" />
//             Start Recording
//           </button>
//         ) : (
//           <button
//             type="button"
//             onClick={onStopRecording}
//             className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 shadow"
//           >
//             <Square className="w-4 h-4" />
//             Stop
//           </button>
//         )}

//         {/* Evaluate current answer */}
//         <button
//           type="button"
//           onClick={onEvaluate}
//           disabled={!transcript?.trim()}
//           className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 shadow disabled:opacity-50"
//           title="Score this answer"
//         >
//           <CheckCircle2 className="w-4 h-4" />
//           Evaluate
//         </button>

//         {/* Next */}
//         <button
//           type="button"
//           onClick={onNextQuestion}
//           disabled={!canGoNext}
//           className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-gray-700 hover:bg-gray-50 disabled:opacity-50 ml-auto"
//           title="Next question"
//         >
//           <SkipForward className="w-4 h-4" />
//           Next Question
//         </button>

//         {/* End interview */}
//         <button
//           type="button"
//           onClick={onEndInterview}
//           className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 shadow"
//           title="Finish and view feedback"
//         >
//           <Flag className="w-4 h-4" />
//           End Interview
//         </button>

//         {/* Tiny status */}
//         <div className="text-xs text-gray-500 ml-2">
//           {hasEvaluation ? "✓ Current answer evaluated" : "— Not evaluated yet"}
//         </div>
//       </div>
//     </div>
//   );
// }
