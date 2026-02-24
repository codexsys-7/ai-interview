// GlowingOrb.jsx - Premium Sci-Fi Style AI Speaking Indicator
// A visually stunning glowing orb that pulses when AI is speaking

import { memo } from "react";

const GlowingOrb = memo(({ isActive, size = 120, className = "" }) => {
  // Don't render if not active
  if (!isActive) return null;

  const sizeStyle = {
    width: `${size}px`,
    height: `${size}px`,
  };

  const particleSize = {
    small: Math.max(6, size * 0.05),
    medium: Math.max(8, size * 0.067),
    large: Math.max(10, size * 0.083),
  };

  return (
    <div
      className={`glowing-orb-container relative flex items-center justify-center ${className}`}
      role="status"
      aria-label="AI is speaking"
      aria-live="polite"
    >
      {/* Outer glow layer - creates the ambient light effect */}
      <div
        className="orb-glow absolute rounded-full animate-glow-pulse"
        style={{
          ...sizeStyle,
          background:
            "radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(96, 165, 250, 0.3) 40%, rgba(59, 130, 246, 0) 70%)",
          transform: "scale(1.8)",
          filter: "blur(20px)",
        }}
      />

      {/* Secondary glow ring */}
      <div
        className="absolute rounded-full animate-ring-pulse"
        style={{
          width: `${size * 1.4}px`,
          height: `${size * 1.4}px`,
          border: "2px solid rgba(147, 197, 253, 0.3)",
          boxShadow: "0 0 20px rgba(59, 130, 246, 0.3)",
        }}
      />

      {/* Main orb sphere */}
      <div
        className="orb-outer relative rounded-full animate-orb-pulse overflow-hidden"
        style={{
          ...sizeStyle,
          background: `radial-gradient(
            circle at 30% 30%,
            #93c5fd 0%,
            #60a5fa 25%,
            #3b82f6 50%,
            #2563eb 75%,
            #1d4ed8 100%
          )`,
          boxShadow: `
            0 0 60px rgba(59, 130, 246, 0.6),
            0 0 100px rgba(59, 130, 246, 0.4),
            0 0 140px rgba(59, 130, 246, 0.2),
            inset 0 0 40px rgba(255, 255, 255, 0.15),
            inset 0 -20px 40px rgba(30, 64, 175, 0.3)
          `,
        }}
      >
        {/* Top-left highlight/shine for 3D effect */}
        <div
          className="orb-highlight absolute rounded-full"
          style={{
            width: "45%",
            height: "45%",
            top: "10%",
            left: "15%",
            background:
              "radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.7) 0%, rgba(255, 255, 255, 0.3) 40%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        {/* Secondary highlight */}
        <div
          className="absolute rounded-full"
          style={{
            width: "20%",
            height: "20%",
            top: "18%",
            left: "25%",
            background:
              "radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, transparent 70%)",
            filter: "blur(4px)",
          }}
        />

        {/* Inner sphere container with particles */}
        <div
          className="orb-inner absolute rounded-full overflow-hidden"
          style={{
            top: "15%",
            left: "15%",
            right: "15%",
            bottom: "15%",
          }}
        >
          {/* Particle 1 - Largest, slowest */}
          <div
            className="particle absolute rounded-full animate-particle-float-1"
            style={{
              width: `${particleSize.large}px`,
              height: `${particleSize.large}px`,
              background:
                "radial-gradient(circle, rgba(255, 255, 255, 0.9) 0%, rgba(147, 197, 253, 0.5) 60%, transparent 100%)",
              top: "25%",
              left: "35%",
              boxShadow: "0 0 12px rgba(255, 255, 255, 0.8)",
              willChange: "transform, opacity",
            }}
          />

          {/* Particle 2 - Medium */}
          <div
            className="particle absolute rounded-full animate-particle-float-2"
            style={{
              width: `${particleSize.medium}px`,
              height: `${particleSize.medium}px`,
              background:
                "radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(147, 197, 253, 0.4) 60%, transparent 100%)",
              top: "55%",
              left: "60%",
              boxShadow: "0 0 10px rgba(255, 255, 255, 0.7)",
              willChange: "transform, opacity",
            }}
          />

          {/* Particle 3 - Medium */}
          <div
            className="particle absolute rounded-full animate-particle-float-3"
            style={{
              width: `${particleSize.medium}px`,
              height: `${particleSize.medium}px`,
              background:
                "radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, rgba(147, 197, 253, 0.45) 60%, transparent 100%)",
              top: "40%",
              left: "20%",
              boxShadow: "0 0 10px rgba(255, 255, 255, 0.65)",
              willChange: "transform, opacity",
            }}
          />

          {/* Particle 4 - Smallest, fastest */}
          <div
            className="particle absolute rounded-full animate-particle-float-4"
            style={{
              width: `${particleSize.small}px`,
              height: `${particleSize.small}px`,
              background:
                "radial-gradient(circle, rgba(255, 255, 255, 0.75) 0%, rgba(147, 197, 253, 0.3) 60%, transparent 100%)",
              top: "65%",
              left: "40%",
              boxShadow: "0 0 8px rgba(255, 255, 255, 0.5)",
              willChange: "transform, opacity",
            }}
          />
        </div>

        {/* Subtle inner ring for depth */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            top: "8%",
            left: "8%",
            right: "8%",
            bottom: "8%",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            background:
              "radial-gradient(circle at 70% 70%, transparent 40%, rgba(30, 64, 175, 0.2) 100%)",
          }}
        />

        {/* Bottom reflection/shadow */}
        <div
          className="absolute rounded-full"
          style={{
            width: "60%",
            height: "30%",
            bottom: "5%",
            left: "20%",
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(30, 58, 138, 0.4) 0%, transparent 70%)",
            filter: "blur(6px)",
          }}
        />
      </div>

      {/* CSS Keyframe Animations */}
      <style>{`
        @keyframes orb-pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.15);
          }
        }

        @keyframes glow-pulse {
          0%, 100% {
            opacity: 0.7;
            transform: scale(1.8);
          }
          50% {
            opacity: 1;
            transform: scale(2.1);
          }
        }

        @keyframes ring-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }

        @keyframes particle-float-1 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.8;
          }
          25% {
            transform: translate(10px, -8px) scale(1.2);
            opacity: 1;
          }
          50% {
            transform: translate(15px, 5px) scale(0.9);
            opacity: 0.7;
          }
          75% {
            transform: translate(-5px, 10px) scale(1.1);
            opacity: 0.9;
          }
        }

        @keyframes particle-float-2 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.75;
          }
          33% {
            transform: translate(-12px, 8px) scale(1.15);
            opacity: 0.95;
          }
          66% {
            transform: translate(8px, -10px) scale(0.85);
            opacity: 0.6;
          }
        }

        @keyframes particle-float-3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.7;
          }
          40% {
            transform: translate(8px, 12px) scale(1.25);
            opacity: 1;
          }
          70% {
            transform: translate(-6px, -4px) scale(0.9);
            opacity: 0.65;
          }
        }

        @keyframes particle-float-4 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            opacity: 0.6;
          }
          30% {
            transform: translate(-10px, -6px) scale(1.1);
            opacity: 0.85;
          }
          60% {
            transform: translate(6px, 8px) scale(0.95);
            opacity: 0.5;
          }
          85% {
            transform: translate(-4px, 4px) scale(1.05);
            opacity: 0.75;
          }
        }

        .animate-orb-pulse {
          animation: orb-pulse 1.2s ease-in-out infinite;
        }

        .animate-glow-pulse {
          animation: glow-pulse 1.2s ease-in-out infinite;
        }

        .animate-ring-pulse {
          animation: ring-pulse 1.2s ease-in-out infinite;
        }

        .animate-particle-float-1 {
          animation: particle-float-1 3s ease-in-out infinite;
        }

        .animate-particle-float-2 {
          animation: particle-float-2 4s ease-in-out infinite;
        }

        .animate-particle-float-3 {
          animation: particle-float-3 2.5s ease-in-out infinite;
        }

        .animate-particle-float-4 {
          animation: particle-float-4 3.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
});

GlowingOrb.displayName = "GlowingOrb";

export default GlowingOrb;
