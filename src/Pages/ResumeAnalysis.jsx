// This is the third version, i am working on feedback_analysis page.

import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Target, TrendingUp, CheckCircle2, ArrowRight, Award } from "lucide-react";
import ChipList from "../Components/Upload/Chiplist.jsx";

const DIFFICULTY_LEVELS = ["Intern", "Junior", "Associate", "Senior"];
const INTERVIEWERS = ["Manager", "CEO", "CFO", "HR", "Vice President", "President"];
const HARD_DEFAULT_ROLES = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"];

const PLAN_KEY = "interviewPlan";

const questionCountFor = (difficulty) =>
  difficulty === "Senior" ? 26 :
  difficulty === "Associate" ? 25 :
  difficulty === "Junior" ? 20 : 15;

const buildFallbackPlan = ({ role, difficulty, interviewers, skills = [] }) => {
  const count = questionCountFor(difficulty);
  return {
    meta: {
      role,
      difficulty,
      interviewers,
      questionCount: count,
      timePerQuestionSec: 120
    },
    questions: Array.from({ length: count }, (_, i) => ({
      id: `Q${i + 1}`,
      type: i % 3 === 0 ? "behavioral" : "technical",
      topic: skills[i % (skills.length || 1)] || "General",
      interviewer: interviewers[i % interviewers.length],
      prompt:
        difficulty === "Senior"
          ? `Senior-level: How would you use your experience to drive measurable business growth as a ${role}?`
          : `Question ${i + 1} for ${role}: explain a core concept you’ve used recently.`,
      idealAnswer: [
        "State the problem and context.",
        "Describe approach, trade-offs, and tools used.",
        "Quantify outcome and business impact."
      ],
      rubric: [
        { criterion: "Vocabulary", weight: 0.2 },
        { criterion: "Clarity", weight: 0.2 },
        { criterion: "Structure", weight: 0.2 },
        { criterion: "Answer framing", weight: 0.2 },
        { criterion: "Relevance", weight: 0.2 }
      ],
      difficulty
    }))
  };
};

export default function ResumeAnalysis() {
  const navigate = useNavigate();
  const [resumeData, setResumeData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // NEW: overlay while generating questions
  const [preparing, setPreparing] = useState(false);

  // Interview config
  const [role, setRole] = useState("");
  const [difficulty, setDifficulty] = useState("Junior");
  const [selectedInterviewers, setSelectedInterviewers] = useState(["Manager"]);

  // ---- Hardened loader for parsedResumeData ----
  useEffect(() => {
    const raw = localStorage.getItem("parsedResumeData");
    if (!raw) { navigate("/"); return; }
    try {
      const parsed = JSON.parse(raw);

      // If backend sent an error payload, bounce gracefully
      if (parsed && typeof parsed === "object" && parsed.error) {
        console.error("Backend parse error:", parsed.error);
        localStorage.removeItem("parsedResumeData");
        navigate("/");
        return;
      }

      // Normalize RARe
      const rareObj = parsed?.rare ?? {};
      const readability = Number(rareObj.readability);
      const applicability = Number(rareObj.applicability);
      const remarkability = Number(rareObj.remarkability);
      const total =
        Number.isFinite(Number(rareObj.total))
          ? Number(rareObj.total)
          : Number(
              ((Number.isFinite(readability) ? readability : 4.5) +
               (Number.isFinite(applicability) ? applicability : 4.5) +
               (Number.isFinite(remarkability) ? remarkability : 4.5)) / 3
            ) || 4.5;

      const rare = {
        readability: Number.isFinite(readability) ? readability : 4.5,
        applicability: Number.isFinite(applicability) ? applicability : 4.5,
        remarkability: Number.isFinite(remarkability) ? remarkability : 4.5,
        total
      };

      const atsScore = Number.isFinite(Number(parsed?.atsScore)) ? Number(parsed.atsScore) : 85;
      const atsSuggestions = Array.isArray(parsed?.atsSuggestions) ? parsed.atsSuggestions : [];

      // Support old mock key `fallbackroles`
      const fallbackRoles =
        (Array.isArray(parsed?.fallbackRoles) && parsed.fallbackRoles.length && parsed.fallbackRoles) ||
        (Array.isArray(parsed?.fallbackroles) && parsed.fallbackroles.length && parsed.fallbackroles) ||
        HARD_DEFAULT_ROLES;

      const normalized = {
        ...parsed,
        rare,
        atsScore,
        atsSuggestions,
        fallbackRoles,
        skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
        keywords: Array.isArray(parsed?.keywords) ? parsed.keywords : [],
      };

      setResumeData(normalized);
      setRole(fallbackRoles[0]);
      setIsLoading(false);
    } catch (e) {
      console.error("Failed to parse resume data JSON:", e);
      localStorage.removeItem("parsedResumeData");
      navigate("/");
    }
  }, [navigate]);

  const toggleInterviewer = (interviewer) => {
    setSelectedInterviewers((prev) => {
      if (prev.includes(interviewer)) {
        return prev.length > 1 ? prev.filter((i) => i !== interviewer) : prev;
      }
      return [...prev, interviewer];
    });
  };

  const handleStartInterview = async () => {
    try {
      setPreparing(true); // show loader overlay
      const settings = { role, difficulty, interviewers: selectedInterviewers };
      const count =
        difficulty === "Senior" ? 26 :
        difficulty === "Associate" ? 25 :
        difficulty === "Junior" ? 20 : 15;

      const res = await fetch("http://127.0.0.1:8000/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, count })
      });
      if (!res.ok) throw new Error("Failed to generate questions");
      const plan = await res.json();

      localStorage.setItem("interviewSettings", JSON.stringify(settings));
      localStorage.setItem("interviewPlan", JSON.stringify(plan));
      navigate("/interview");
    } catch (e) {
      console.error(e);
      alert("Could not generate interview questions. Please try again.");
      setPreparing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading resume analysis...</p>
        </div>
      </div>
    );
  }

  if (!resumeData) {
    return (
      <div className="p-8 text-center text-gray-600">
        Couldn’t load analysis. <a className="text-indigo-600 underline" href="/">Go back</a>
      </div>
    );
  }

  const availableRoles =
    (Array.isArray(resumeData.fallbackRoles) && resumeData.fallbackRoles.length && resumeData.fallbackRoles) ||
    HARD_DEFAULT_ROLES;

  const rare = resumeData?.rare ?? { readability: 0, applicability: 0, remarkability: 0, total: 0 };
  const atsScore = Number.isFinite(Number(resumeData?.atsScore)) ? Number(resumeData.atsScore) : 0;

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Resume Analysis</h1>
          <p className="text-lg text-gray-600">Here's what we extracted from your resume</p>
        </div>

        {/* Analysis Cards */}
        <div className="space-y-6 mb-12">
          {/* Skills */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-semibold text-gray-900">Skills Detected</h3>
            </div>
            {resumeData.skills?.length ? (
              <ChipList items={resumeData.skills} color="blue" />
            ) : (
              <p className="text-gray-500 italic">No skills detected in the uploaded resume.</p>
            )}
          </div>

          {/* RARe */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <Award className="w-6 h-6 text-purple-600" />
              <h3 className="text-xl font-semibold text-gray-900">RARe Score</h3>
            </div>

            <div className="text-center mb-8 pb-8 border-b border-gray-200">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full mb-3">
                <span className="text-4xl font-bold text-purple-700">
                  {Number.isFinite(rare.total) ? rare.total.toFixed(1) : "—"}
                </span>
              </div>
              <p className="text-sm text-gray-600">Total RARe Score out of 5</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-3">
                  <span className="text-2xl font-bold text-blue-700">
                    {Number.isFinite(rare.readability) ? rare.readability.toFixed(1) : "—"}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Readability</h4>
                <p className="text-sm text-gray-600">Clarity, scannability, and grammar quality</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                  <span className="text-2xl font-bold text-green-700">
                    {Number.isFinite(rare.applicability) ? rare.applicability.toFixed(1) : "—"}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Applicability</h4>
                <p className="text-sm text-gray-600">Alignment of skills and keywords with target roles</p>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-3">
                  <span className="text-2xl font-bold text-amber-700">
                    {Number.isFinite(rare.remarkability) ? rare.remarkability.toFixed(1) : "—"}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Remarkability</h4>
                <p className="text-sm text-gray-600">Quantified impact, metrics, and uniqueness</p>
              </div>
            </div>
          </div>

          {/* ATS */}
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <h3 className="text-xl font-semibold text-gray-900">ATS Score</h3>
            </div>

            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-32 h-32 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full mb-3">
                <span className="text-5xl font-bold text-green-700">
                  {atsScore}%
                </span>
              </div>
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                Keyword match, structure, and formatting readiness for Applicant Tracking Systems
              </p>
            </div>

            {/* Optional keywords section */}
            {Array.isArray(resumeData.keywords) && resumeData.keywords.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Keywords Detected:</h4>
                <div className="flex flex-wrap gap-2">
                  {resumeData.keywords.slice(0, 5).map((kw, i) => (
                    <span key={i} className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggestions if ATS < 90 */}
          {atsScore < 90 && Array.isArray(resumeData.atsSuggestions) && resumeData.atsSuggestions.length > 0 && (
            <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Suggestions to Improve ATS Score</h3>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                {resumeData.atsSuggestions.map((tip, idx) => (
                  <li key={idx}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Configure Interview */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-xl p-6 sm:p-8 border border-indigo-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Configure Your Interview</h2>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Role */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Select the Role you are Interviewing/Practice for
              </label>
              <div className="grid grid-cols-1 gap-3">
                {availableRoles.map((roleName) => (
                  <button
                    key={roleName}
                    onClick={() => setRole(roleName)}
                    className={`py-3 px-4 rounded-lg font-medium transition-all text-left ${
                      role === roleName
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                    }`}
                  >
                    {roleName}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">Difficulty Level</label>
              <div className="grid grid-cols-2 gap-3">
                {DIFFICULTY_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    className={`py-3 px-4 rounded-lg font-medium transition-all ${
                      difficulty === level
                        ? "bg-indigo-600 text-white shadow-md"
                        : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interviewers */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Interviewer(s) <span className="text-gray-500 font-normal">(Select multiple, at least 1)</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {INTERVIEWERS.map((interviewer) => (
                <button
                  key={interviewer}
                  onClick={() => toggleInterviewer(interviewer)}
                  className={`py-3 px-4 rounded-lg font-medium transition-all relative ${
                    selectedInterviewers.includes(interviewer)
                      ? "bg-purple-600 text-white shadow-md"
                      : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
                  }`}
                >
                  {selectedInterviewers.includes(interviewer) && (
                    <CheckCircle2 className="w-4 h-4 absolute top-2 right-2" />
                  )}
                  <span className="block truncate pr-5">{interviewer}</span>
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleStartInterview}
              className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-12 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
            >
              Start Interview
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          {/* Summary */}
          <div className="mt-6 pt-6 border-t border-indigo-200">
            <div className="flex flex-wrap gap-4 justify-center text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Role:</span>
                <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">{role}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Level:</span>
                <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">{difficulty}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Interviewer(s):</span>
                <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">
                  {selectedInterviewers.join(", ")}
                </span>
              </div>
            </div>
          </div>

          {/* Loading Animation */}
          {preparing && (
            <div
              className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm grid place-items-center"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <div className="text-gray-700 font-medium">Preparing your interview…</div>
                <div className="text-gray-500 text-sm">
                  Generating role-specific questions & setting up the room
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}





// This is the Second Version of Resume Analysis Until my Interview Page is well and good.
// src/pages/ResumeAnalysis.jsx
// import React, { useState, useEffect, useRef, useMemo } from "react";
// import { useNavigate } from "react-router-dom";
// import { FileText, Target, TrendingUp, CheckCircle2, ArrowRight, Award } from "lucide-react";
// import ChipList from "../Components/Upload/Chiplist.jsx";

// const DIFFICULTY_LEVELS = ["Intern", "Junior", "Associate", "Senior"];
// const INTERVIEWERS = ["Manager", "CEO", "CFO", "HR", "Vice President", "President"];
// const HARD_DEFAULT_ROLES = ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst"];

// const PLAN_KEY = "interviewPlan";

// const questionCountFor = (difficulty) =>
//   difficulty === "Senior" ? 26 :
//   difficulty === "Associate" ? 25 :
//   difficulty === "Junior" ? 20 : 15;

// const buildFallbackPlan = ({ role, difficulty, interviewers, skills = [] }) => {
//   const count = questionCountFor(difficulty);
//   return {
//     meta: {
//       role,
//       difficulty,
//       interviewers,
//       questionCount: count,
//       timePerQuestionSec: 120
//     },
//     questions: Array.from({ length: count }, (_, i) => ({
//       id: `Q${i + 1}`,
//       type: i % 3 === 0 ? "behavioral" : "technical",
//       topic: skills[i % (skills.length || 1)] || "General",
//       interviewer: interviewers[i % interviewers.length],
//       prompt:
//         difficulty === "Senior"
//           ? `Senior-level: How would you use your experience to drive measurable business growth as a ${role}?`
//           : `Question ${i + 1} for ${role}: explain a core concept you’ve used recently.`,
//       idealAnswer: [
//         "State the problem and context.",
//         "Describe approach, trade-offs, and tools used.",
//         "Quantify outcome and business impact."
//       ],
//       rubric: [
//         { criterion: "Vocabulary", weight: 0.2 },
//         { criterion: "Clarity", weight: 0.2 },
//         { criterion: "Structure", weight: 0.2 },
//         { criterion: "Answer framing", weight: 0.2 },
//         { criterion: "Relevance", weight: 0.2 }
//       ],
//       difficulty
//     }))
//   };
// };


// export default function ResumeAnalysis() {
//   const navigate = useNavigate();
//   const [resumeData, setResumeData] = useState(null);
//   const [isLoading, setIsLoading] = useState(true);

//   // Interview config
//   const [role, setRole] = useState("");
//   const [difficulty, setDifficulty] = useState("Junior");
//   const [selectedInterviewers, setSelectedInterviewers] = useState(["Manager"]);

//   useEffect(() => {
//     const raw = localStorage.getItem("parsedResumeData");
//     if (!raw) { navigate("/"); return; }

//     try {
//       const parsed = JSON.parse(raw);

//       // Prefer stored RARe / ATS; keep safe fallbacks for older data
//       const rare = parsed.rare ?? { readability: 4.5, applicability: 4.5, remarkability: 4.5, total: 4.5 };
//       if (typeof rare.total !== "number") {
//         const avg = ((rare.readability || 0) + (rare.applicability || 0) + (rare.remarkability || 0)) / 3;
//         rare.total = avg || 4.5;
//       }

//       const atsScore = typeof parsed.atsScore === "number" ? parsed.atsScore : 85;

//       const normalized = {
//         ...parsed,
//         rare,
//         atsScore,
//         atsSuggestions: Array.isArray(parsed.atsSuggestions) ? parsed.atsSuggestions : [],
//       };

//       setResumeData(normalized);

//       const rolesFromStorage =
//         (parsed.fallbackRoles?.length && parsed.fallbackRoles) ||
//         HARD_DEFAULT_ROLES;

//       setRole(rolesFromStorage[0]);
//       setIsLoading(false);
//     } catch (e) {
//       console.error("Failed to parse resume data:", e);
//       localStorage.removeItem("parsedResumeData");
//       navigate("/");
//     }
//   }, [navigate]);

//   const toggleInterviewer = (interviewer) => {
//     setSelectedInterviewers((prev) => {
//       if (prev.includes(interviewer)) {
//         return prev.length > 1 ? prev.filter((i) => i !== interviewer) : prev;
//       }
//       return [...prev, interviewer];
//     });
//   };

//   const handleStartInterview = async () => {
//   // show a button-level loading state in your UI while this runs
//   try {
//     const settings = { role, difficulty, interviewers: selectedInterviewers };
//     const count =
//       difficulty === "Senior" ? 26 :
//       difficulty === "Associate" ? 25 :
//       difficulty === "Junior" ? 20 : 15;

//     const res = await fetch("http://127.0.0.1:8000/api/generate-questions", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ ...settings, count })
//     });
//     if (!res.ok) throw new Error("Failed to generate questions");
//     const plan = await res.json();

//     localStorage.setItem("interviewSettings", JSON.stringify(settings));
//     localStorage.setItem("interviewPlan", JSON.stringify(plan)); // PLAN_KEY

//     navigate("/interview");
//   } catch (e) {
//     console.error(e);
//     alert("Could not generate interview questions. Please try again.");
//   }
//   };



//   if (isLoading) {
//     return (
//       <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 flex items-center justify-center">
//         <div className="text-center">
//           <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
//           <p className="text-gray-500">Loading resume analysis...</p>
//         </div>
//       </div>
//     );
//   }

//   if (!resumeData) {
//     return (
//       <div className="p-8 text-center text-gray-600">
//         Couldn’t load analysis. <a className="text-indigo-600 underline" href="/">Go back</a>
//       </div>
//     );
//   }

//   const availableRoles =
//     (resumeData.fallbackRoles?.length && resumeData.fallbackRoles) ||
//     HARD_DEFAULT_ROLES;

//   const rare = resumeData.rare;
//   const atsScore = resumeData.atsScore;
//   const topKeywords = Array.isArray(resumeData.keywords) ? resumeData.keywords.slice(0, 5) : [];

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-12">
//           <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
//             <FileText className="w-8 h-8 text-white" />
//           </div>
//           <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Resume Analysis</h1>
//           <p className="text-lg text-gray-600">Here's what we extracted from your resume</p>
//         </div>

//         {/* Analysis Cards */}
//         <div className="space-y-6 mb-12">
//           {/* Skills */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-4">
//               <Target className="w-6 h-6 text-blue-600" />
//               <h3 className="text-xl font-semibold text-gray-900">Skills Detected</h3>
//             </div>
//             {resumeData.skills?.length ? (
//               <ChipList items={resumeData.skills} color="blue" />
//             ) : (
//               <p className="text-gray-500 italic">No skills detected in the uploaded resume.</p>
//             )}
//           </div>

//           {/* RARe */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-6">
//               <Award className="w-6 h-6 text-purple-600" />
//               <h3 className="text-xl font-semibold text-gray-900">RARe Score</h3>
//             </div>

//             <div className="text-center mb-8 pb-8 border-b border-gray-200">
//               <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full mb-3">
//                 <span className="text-4xl font-bold text-purple-700">
//                   {Number.isFinite(rare.total) ? rare.total.toFixed(1) : "—"}
//                 </span>
//               </div>
//               <p className="text-sm text-gray-600">Total RARe Score out of 5</p>
//             </div>

//             <div className="grid sm:grid-cols-3 gap-6">
//               <div className="text-center">
//                 <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-3">
//                   <span className="text-2xl font-bold text-blue-700">
//                     {Number.isFinite(rare.readability) ? rare.readability.toFixed(1) : "—"}
//                   </span>
//                 </div>
//                 <h4 className="font-semibold text-gray-900 mb-2">Readability</h4>
//                 <p className="text-sm text-gray-600">Clarity, scannability, and grammar quality</p>
//               </div>

//               <div className="text-center">
//                 <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
//                   <span className="text-2xl font-bold text-green-700">
//                     {Number.isFinite(rare.applicability) ? rare.applicability.toFixed(1) : "—"}
//                   </span>
//                 </div>
//                 <h4 className="font-semibold text-gray-900 mb-2">Applicability</h4>
//                 <p className="text-sm text-gray-600">Alignment of skills and keywords with target roles</p>
//               </div>

//               <div className="text-center">
//                 <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-100 rounded-full mb-3">
//                   <span className="text-2xl font-bold text-amber-700">
//                     {Number.isFinite(rare.remarkability) ? rare.remarkability.toFixed(1) : "—"}
//                   </span>
//                 </div>
//                 <h4 className="font-semibold text-gray-900 mb-2">Remarkability</h4>
//                 <p className="text-sm text-gray-600">Quantified impact, metrics, and uniqueness</p>
//               </div>
//             </div>
//           </div>

//           {/* ATS */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-6">
//               <TrendingUp className="w-6 h-6 text-green-600" />
//               <h3 className="text-xl font-semibold text-gray-900">ATS Score</h3>
//             </div>

//             <div className="text-center mb-6">
//               <div className="inline-flex items-center justify-center w-32 h-32 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full mb-3">
//                 <span className="text-5xl font-bold text-green-700">
//                   {atsScore}%
//                 </span>
//               </div>
//               <p className="text-sm text-gray-600 max-w-md mx-auto">
//                 Keyword match, structure, and formatting readiness for Applicant Tracking Systems
//               </p>
//             </div>

//             {/* Optional keywords section (only if present in data) */}
//             {Array.isArray(resumeData.keywords) && resumeData.keywords.length > 0 && (
//               <div>
//                 <h4 className="text-sm font-semibold text-gray-700 mb-3">Top Keywords Detected:</h4>
//                 <div className="flex flex-wrap gap-2">
//                   {resumeData.keywords.slice(0, 5).map((kw, i) => (
//                     <span key={i} className="px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-full text-sm font-medium">
//                       {kw}
//                     </span>
//                   ))}
//                 </div>
//               </div>
//             )}
//           </div>

//           {/* Suggestions if ATS < 90 */}
//           {atsScore < 90 && Array.isArray(resumeData.atsSuggestions) && resumeData.atsSuggestions.length > 0 && (
//             <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//               <h3 className="text-xl font-semibold text-gray-900 mb-4">Suggestions to Improve ATS Score</h3>
//               <ul className="list-disc pl-6 space-y-2 text-gray-700">
//                 {resumeData.atsSuggestions.map((tip, idx) => (
//                   <li key={idx}>{tip}</li>
//                 ))}
//               </ul>
//             </div>
//           )}
//         </div>

//         {/* Configure Interview */}
//         <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-xl p-6 sm:p-8 border border-indigo-100">
//           <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Configure Your Interview</h2>

//           <div className="grid md:grid-cols-2 gap-8 mb-8">
//             {/* Role */}
//             <div>
//               <label className="block text-sm font-semibold text-gray-700 mb-3">
//                 Select the Role you are Interviewing/Practice for
//               </label>
//               <div className="grid grid-cols-1 gap-3">
//                 {availableRoles.map((roleName) => (
//                   <button
//                     key={roleName}
//                     onClick={() => setRole(roleName)}
//                     className={`py-3 px-4 rounded-lg font-medium transition-all text-left ${
//                       role === roleName
//                         ? "bg-indigo-600 text-white shadow-md"
//                         : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
//                     }`}
//                   >
//                     {roleName}
//                   </button>
//                 ))}
//               </div>
//             </div>

//             {/* Difficulty */}
//             <div>
//               <label className="block text-sm font-semibold text-gray-700 mb-3">Difficulty Level</label>
//               <div className="grid grid-cols-2 gap-3">
//                 {DIFFICULTY_LEVELS.map((level) => (
//                   <button
//                     key={level}
//                     onClick={() => setDifficulty(level)}
//                     className={`py-3 px-4 rounded-lg font-medium transition-all ${
//                       difficulty === level
//                         ? "bg-indigo-600 text-white shadow-md"
//                         : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
//                     }`}
//                   >
//                     {level}
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>

//           {/* Interviewers */}
//           <div className="mb-8">
//             <label className="block text-sm font-semibold text-gray-700 mb-3">
//               Interviewer(s) <span className="text-gray-500 font-normal">(Select multiple, at least 1)</span>
//             </label>
//             <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
//               {INTERVIEWERS.map((interviewer) => (
//                 <button
//                   key={interviewer}
//                   onClick={() => toggleInterviewer(interviewer)}
//                   className={`py-3 px-4 rounded-lg font-medium transition-all relative ${
//                     selectedInterviewers.includes(interviewer)
//                       ? "bg-purple-600 text-white shadow-md"
//                       : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
//                   }`}
//                 >
//                   {selectedInterviewers.includes(interviewer) && (
//                     <CheckCircle2 className="w-4 h-4 absolute top-2 right-2" />
//                   )}
//                   <span className="block truncate pr-5">{interviewer}</span>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {/* CTA */}
//           <div className="flex justify-center">
//             <button
//               type = "button"
//               onClick={handleStartInterview}
//               className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-12 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
//             >
//               Start Interview
//               <ArrowRight className="w-5 h-5" />
//             </button>
//           </div>

//           {/* Summary */}
//           <div className="mt-6 pt-6 border-t border-indigo-200">
//             <div className="flex flex-wrap gap-4 justify-center text-sm text-gray-600">
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold">Role:</span>
//                 <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">{role}</span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold">Level:</span>
//                 <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">{difficulty}</span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold">Interviewer(s):</span>
//                 <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">
//                   {selectedInterviewers.join(", ")}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }





// This is the First version of Resume Analysis, Only with Skills, Top Keywords, Customise Interview Button.

// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { FileText, Briefcase, Target, Users, ArrowRight, CheckCircle } from "lucide-react";
// import ChipList from "../Components/Upload/Chiplist.jsx";

// const DIFFICULTY_LEVELS = ["Intern", "Junior", "Associate", "Senior"];
// const INTERVIEWERS = ["Manager", "CEO", "CFO", "HR", "Vice President", "President"];

// export default function ResumeAnalysis() {
//   const navigate = useNavigate();
//   const [resumeData, setResumeData] = useState(null);
//   const [difficulty, setDifficulty] = useState("Junior");
//   const [selectedInterviewers, setSelectedInterviewers] = useState(["Manager"]);

//   useEffect(() => {
//     // Load resume data from localStorage
//     const storedData = localStorage.getItem("parsedResumeData");
//     if (storedData) {
//       setResumeData(JSON.parse(storedData));
//     } else {
//       // Redirect to home if no resume data
//       navigate("/");
//     }
//   }, [navigate]);

//   const toggleInterviewer = (interviewer) => {
//     if (selectedInterviewers.includes(interviewer)) {
//       // Remove if already selected
//       if (selectedInterviewers.length > 1) {
//         setSelectedInterviewers(selectedInterviewers.filter(i => i !== interviewer));
//       }
//     } else {
//       // Add to selection
//       setSelectedInterviewers([...selectedInterviewers, interviewer]);
//     }
//   };

//   const handleStartInterview = () => {
//     // Save interview settings
//     const settings = {
//       difficulty,
//       interviewers: selectedInterviewers
//     };
//     localStorage.setItem("interviewSettings", JSON.stringify(settings));
//     navigate("/interview");
//   };

//   if (!resumeData) {
//     return (
//       <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center">
//         <div className="text-center">
//           <p className="text-gray-500">Loading resume analysis...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8">
//       <div className="max-w-5xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-12">
//           <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
//             <FileText className="w-8 h-8 text-white" />
//           </div>
//           <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
//             Resume Analysis
//           </h1>
//           <p className="text-lg text-gray-600">
//             Here's what we extracted from your resume
//           </p>
//         </div>

//         {/* Resume Data Cards */}
//         <div className="space-y-6 mb-12">
//           {/* Skills Card */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-4">
//               <Target className="w-6 h-6 text-blue-600" />
//               <h3 className="text-xl font-semibold text-gray-900">Skills Detected</h3>
//             </div>
//             <ChipList items={resumeData.skills} color="blue" />
//           </div>

//           {/* Keywords Card */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-4">
//               <Briefcase className="w-6 h-6 text-purple-600" />
//               <h3 className="text-xl font-semibold text-gray-900">Top Keywords</h3>
//             </div>
//             <ChipList items={resumeData.keywords} color="purple" />
//           </div>

//           {/* Categories Card */}
//           <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
//             <div className="flex items-center gap-3 mb-4">
//               <Users className="w-6 h-6 text-green-600" />
//               <h3 className="text-xl font-semibold text-gray-900">Job Categories</h3>
//             </div>
//             <ChipList items={resumeData.categories} color="green" />
//           </div>
//         </div>

//         {/* Interview Configuration */}
//         <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-xl p-6 sm:p-8 border border-indigo-100">
//           <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
//             Configure Your Interview
//           </h2>

//           <div className="grid md:grid-cols-2 gap-8 mb-8">
//             {/* Difficulty Level */}
//             <div>
//               <label className="block text-sm font-semibold text-gray-700 mb-3">
//                 Difficulty Level
//               </label>
//               <div className="grid grid-cols-2 gap-3">
//                 {DIFFICULTY_LEVELS.map((level) => (
//                   <button
//                     key={level}
//                     onClick={() => setDifficulty(level)}
//                     className={`py-3 px-4 rounded-lg font-medium transition-all ${
//                       difficulty === level
//                         ? "bg-indigo-600 text-white shadow-md"
//                         : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
//                     }`}
//                   >
//                     {level}
//                   </button>
//                 ))}
//               </div>
//             </div>

//             {/* Interviewers */}
//             <div>
//               <label className="block text-sm font-semibold text-gray-700 mb-3">
//                 Interviewer(s) <span className="text-gray-500 font-normal">(Select multiple)</span>
//               </label>
//               <div className="grid grid-cols-2 gap-3">
//                 {INTERVIEWERS.map((interviewer) => (
//                   <button
//                     key={interviewer}
//                     onClick={() => toggleInterviewer(interviewer)}
//                     className={`py-3 px-4 rounded-lg font-medium transition-all relative ${
//                       selectedInterviewers.includes(interviewer)
//                         ? "bg-purple-600 text-white shadow-md"
//                         : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200"
//                     }`}
//                   >
//                     {selectedInterviewers.includes(interviewer) && (
//                       <CheckCircle className="w-4 h-4 absolute top-2 right-2" />
//                     )}
//                     <span className="block truncate">{interviewer}</span>
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>

//           {/* Start Interview Button */}
//           <div className="flex justify-center">
//             <button
//               onClick={handleStartInterview}
//               className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-12 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
//             >
//               Start Interview
//               <ArrowRight className="w-5 h-5" />
//             </button>
//           </div>

//           {/* Selected Summary */}
//           <div className="mt-6 pt-6 border-t border-indigo-200">
//             <div className="flex flex-wrap gap-4 justify-center text-sm text-gray-600">
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold">Level:</span>
//                 <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">
//                   {difficulty}
//                 </span>
//               </div>
//               <div className="flex items-center gap-2">
//                 <span className="font-semibold">Interviewer(s):</span>
//                 <span className="bg-white px-3 py-1 rounded-full border border-indigo-200">
//                   {selectedInterviewers.join(", ")}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }