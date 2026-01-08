// src/components/AuthIllustration.jsx
export default function AuthIllustration() {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* soft animated rings */}
      <div className="absolute w-[520px] h-[520px] rounded-full border border-blue-200/60 animate-pulse opacity-60" />
      <div className="absolute w-[380px] h-[380px] rounded-full border border-blue-300/50 animate-pulse opacity-50" />
      <div className="absolute w-[260px] h-[260px] rounded-full border border-blue-400/40 animate-pulse opacity-40" />

      {/* subtle floating blobs for depth */}
      <div className="absolute -top-24 -left-20 w-72 h-72 rounded-full bg-blue-200/25 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 rounded-full bg-blue-300/20 blur-3xl" />

      {/* main brand panel */}
      <div className="relative w-[82%] max-w-md rounded-3xl border border-blue-100 bg-white/65 backdrop-blur-md shadow-2xl px-10 py-10">
        {/* small badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-black-700 text-xs font-semibold">
          Humanlike Interview Simulation
        </div>

        {/* brand text */}
        <h1 className="mt-6 text-4xl font-bold text-blue-700 tracking-wide">
          InterVue Labs
        </h1>

        <h3 className="mt-2 text-sm font-semibold text-black-900 leading-tight">
          AI Interview Simulator
        </h3>

        <p className="mt-4 text-sm text-gray-600 leading-relaxed">
          Practice real interviews, crack ATS + JD matching, and get feedback
          that helps you improve - minus the stress.
        </p>

        {/* clean feature chips (NO bullets, NO card rows) */}
        <div className="mt-7 flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
            Resume Parsing
          </span>
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
            ATS + RARe
          </span>
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
            JD Match
          </span>
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
            Voice Interview
          </span>
          <span className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium">
            Feedback Report
          </span>
        </div>

        {/* decorative bottom gradient line */}
        <div className="mt-8 h-[3px] w-full rounded-full bg-gradient-to-r from-blue-200 via-blue-600 to-blue-200 opacity-70" />
      </div>
    </div>
  );
}
