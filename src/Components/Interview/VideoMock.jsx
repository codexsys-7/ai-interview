import { useState, useEffect, useRef, useMemo } from "react";
import { Camera, Mic, Video } from "lucide-react";

export default function VideoMock({ isRecording }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-4">
        <Video className="w-5 h-5 text-gray-700" />
        <h3 className="text-lg font-semibold text-gray-900">Video Preview</h3>
      </div>

      {/* Video Placeholder */}
      <div className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
        {/* Avatar Circle */}
        <div className="w-24 h-24 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center shadow-2xl">
          <Camera className="w-12 h-12 text-white" />
        </div>

        {/* Recording Indicator */}
        {isRecording && (
          <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-500 px-3 py-1.5 rounded-full animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full" />
            <span className="text-white text-sm font-medium">REC</span>
          </div>
        )}

        {/* Mock Label */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
          <span className="text-white text-sm font-medium">Webcam Preview (Mock)</span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 flex justify-center gap-4">
        <button
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Mic className="w-5 h-5" />
        </button>
        <button
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-blue-100 text-blue-600"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <Camera className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}