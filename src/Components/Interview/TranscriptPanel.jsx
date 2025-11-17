import { useState, useEffect, useRef, useMemo } from "react";
import { Copy, Mic, Pause } from "lucide-react";


// TranscriptPanel.jsx
export default function TranscriptPanel({ transcript, isRecording, isTranscribing }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 sm:p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-800">Your answer (live transcript)</h3>
        <span className="text-xs text-gray-500">
          {isRecording
            ? "Listening… speak clearly"
            : isTranscribing
            ? "Transcribing your answer…"
            : "Not recording"}
        </span>
      </div>
      <div className="min-h-[96px] border border-gray-200 rounded-xl p-3 text-sm text-gray-800 whitespace-pre-wrap bg-gray-50">
        {transcript || (!isRecording && !isTranscribing ? "Your words will appear here as you speak." : "")}
      </div>
    </div>
  );
}

// export default function TranscriptPanel({ transcript, isRecording }) {
//   const copyText = async () => {
//     try {
//       await navigator.clipboard.writeText(transcript || "");
//     } catch {
//       const ta = document.createElement("textarea");
//       ta.value = transcript || "";
//       document.body.appendChild(ta);
//       ta.select();
//       document.execCommand("copy");
//       document.body.removeChild(ta);
//     }
//   };

//   return (
//     <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
//       <div className="flex items-center justify-between mb-2">
//         <div className="flex items-center gap-2">
//           {isRecording ? (
//             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs">
//               <Mic className="w-3.5 h-3.5" /> Recording…
//             </span>
//           ) : (
//             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 border text-xs">
//               <Pause className="w-3.5 h-3.5" /> Paused
//             </span>
//           )}
//           <p className="text-sm font-semibold text-gray-700">Transcript (read-only)</p>
//         </div>
//         <button
//           type="button"
//           onClick={copyText}
//           className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 border"
//           title="Copy transcript"
//         >
//           <Copy className="w-3.5 h-3.5" /> Copy
//         </button>
//       </div>

//       <textarea
//         className="w-full min-h-[140px] rounded-lg border border-gray-200 p-3 text-sm bg-gray-50 text-gray-800"
//         value={transcript}
//         readOnly
//       />
//       <p className="mt-2 text-[11px] text-gray-500">
//         Auto-generated from your speech. You can’t edit this text.
//       </p>
//     </div>
//   );
// }
