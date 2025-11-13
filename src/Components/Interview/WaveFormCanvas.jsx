import { useState, useEffect, useRef, useMemo } from "react";

/**
 * Props:
 * - analyser: AnalyserNode | null
 * - height?: number
 */
export default function WaveformCanvas({ analyser, height = 120 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth * dpr;
    const h = height * dpr;
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    let dataArray, bufferLength;

    const drawIdle = () => {
      ctx.clearRect(0, 0, width, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, h);
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      const mid = h / 2;
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();
    };

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!analyser) {
        drawIdle();
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, width, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, h);

      // Baseline
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      const mid = h / 2;
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.stroke();

      // Waveform
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "#4f46e5"; // indigo
      ctx.beginPath();
      const sliceWidth = (width * 1.0) / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(width, mid);
      ctx.stroke();
    };

    if (analyser) {
      analyser.fftSize = 2048;
      bufferLength = analyser.fftSize;
      dataArray = new Uint8Array(bufferLength);
    }

    draw();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyser, height]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <canvas ref={canvasRef} style={{ width: "100%", height }} />
    </div>
  );
}
