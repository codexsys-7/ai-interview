import { useState, useEffect, useRef, useMemo } from "react";

export default function ThinkTimeRing({ timeLeft = 10, totalTime = 10 }) {
  const pct = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
  const angle = (pct / 100) * 360;
  const ring = `conic-gradient(#4f46e5 ${angle}deg, #e5e7eb ${angle}deg)`;

  return (
    <div className="w-full flex items-center justify-center">
      <div className="relative w-28 h-28">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: ring }}
        />
        <div className="absolute inset-1 rounded-full bg-white shadow-sm flex flex-col items-center justify-center">
          <div className="text-xs text-gray-500">Think Time</div>
          <div className="text-2xl font-semibold text-gray-800 tabular-nums">
            {Math.ceil(timeLeft)}s
          </div>
        </div>
      </div>
    </div>
  );
}
