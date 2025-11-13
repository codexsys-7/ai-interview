import { useState, useEffect, useRef, useMemo } from "react";
import { Camera, CameraOff, Mic, MicOff, AlertTriangle } from "lucide-react";

export default function UserCameraPanel({
  stream,
  isCameraOn,
  isMicOn,
  onToggleCamera,
  onToggleMic,
  permissionError,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Your Camera</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMic}
            className={`px-3 py-1.5 rounded-lg border text-sm transition ${
              isMicOn
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-600"
            }`}
            title={isMicOn ? "Mic on" : "Mic off"}
          >
            {isMicOn ? <Mic className="w-4 h-4 inline" /> : <MicOff className="w-4 h-4 inline" />}
            <span className="ml-1">{isMicOn ? "Mic On" : "Mic Off"}</span>
          </button>

          <button
            type="button"
            onClick={onToggleCamera}
            className={`px-3 py-1.5 rounded-lg border text-sm transition ${
              isCameraOn
                ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                : "bg-gray-50 border-gray-200 text-gray-600"
            }`}
            title={isCameraOn ? "Camera on" : "Camera off"}
          >
            {isCameraOn ? (
              <Camera className="w-4 h-4 inline" />
            ) : (
              <CameraOff className="w-4 h-4 inline" />
            )}
            <span className="ml-1">{isCameraOn ? "Camera On" : "Camera Off"}</span>
          </button>
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        {permissionError ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-6">
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4">
              <div className="flex items-center gap-2 justify-center mb-2">
                <AlertTriangle className="w-5 h-5" />
                <span className="font-semibold">Permission needed</span>
              </div>
              <p className="text-sm">{permissionError}</p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
              isCameraOn ? "bg-indigo-600 text-white" : "bg-gray-300 text-gray-800"
            }`}
          >
            {isCameraOn ? <Camera className="w-3.5 h-3.5" /> : <CameraOff className="w-3.5 h-3.5" />}
            {isCameraOn ? "Camera" : "Camera off"}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
              isMicOn ? "bg-green-600 text-white" : "bg-gray-300 text-gray-800"
            }`}
          >
            {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {isMicOn ? "Mic" : "Mic off"}
          </span>
        </div>
      </div>
    </div>
  );
}
