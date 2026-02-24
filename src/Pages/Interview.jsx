// Phase 1.3: Updated with Intelligent Question Generation + Voice Interactions
// Task 13: Fully Conversational Interview Experience
// Step 4: Job Description Flow Integration

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Sparkles,
  Volume2,
  VolumeX,
  SkipForward,
  Mic,
  MessageSquare,
  Upload,
  FileText,
  Briefcase,
  Target,
  Building2,
  MapPin,
  ClipboardList,
  ChevronRight,
  X,
  AlertCircle,
} from "lucide-react";
import UserCameraPanel from "../Components/Interview/UserCameraPanel.jsx";
import InterviewerPanel from "../Components/Interview/InterviewerPanel.jsx";
import WaveformCanvas from "../Components/Interview/WaveFormCanvas.jsx";
import TranscriptPanel from "../Components/Interview/TranscriptPanel.jsx";
import ControlBar from "../Components/Interview/ControlBar.jsx";
import ThinkTimeRing from "../Components/Interview/ThinkTimeRing.jsx";
import ConversationIndicator from "../Components/Interview/ConversationIndicator.jsx";
import GlowingOrb from "../Components/Interview/GlowingOrb.jsx";

const PLAN_KEY = "interviewPlan";
const RESULTS_KEY = "interviewResults";
const API_BASE = "http://127.0.0.1:8000";

function Spinner({ message = "Preparing your interview…" }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 text-sm">{message}</p>
    </div>
  );
}

function AIThinkingOverlay() {
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm mx-4 text-center">
        <div className="relative mx-auto w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-indigo-200 rounded-full" />
          <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-indigo-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          AI is preparing your next question
        </h3>
        <p className="text-sm text-gray-500">
          Analyzing your responses to create a personalized follow-up...
        </p>
      </div>
    </div>
  );
}

// ==================== Interview Type Selection ====================
function InterviewTypeSelection({ onSelectGeneral, onSelectJobSpecific }) {
  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gradient-to-br from-gray-50 to-indigo-50 px-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Choose Your Interview Type
          </h1>
          <p className="text-gray-600">
            Select how you'd like to practice your interview skills
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* General Interview */}
          <button
            onClick={onSelectGeneral}
            className="group bg-white rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-indigo-500 hover:shadow-xl transition-all duration-300 text-left"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-6 group-hover:bg-indigo-200 transition-colors">
              <ClipboardList className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              General Interview
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Practice common interview questions based on your resume and
              selected role.
            </p>
            <div className="flex items-center text-indigo-600 text-sm font-medium group-hover:translate-x-1 transition-transform">
              Start Practice <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </button>

          {/* Job-Specific Interview */}
          <button
            onClick={onSelectJobSpecific}
            className="group bg-white rounded-2xl p-8 shadow-lg border-2 border-transparent hover:border-purple-500 hover:shadow-xl transition-all duration-300 text-left"
          >
            <div className="w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center mb-6 group-hover:bg-purple-200 transition-colors">
              <Target className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Job-Specific Interview
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Tailored interview based on a specific job description. Get
              personalized questions.
            </p>
            <div className="flex items-center text-purple-600 text-sm font-medium group-hover:translate-x-1 transition-transform">
              Add Job Description <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== Job Description Input Component ====================
function JobDescriptionInput({ onJobDescriptionReady, onCancel, isLoading }) {
  const [inputMethod, setInputMethod] = useState("paste"); // 'paste' | 'upload' | 'manual'
  const [rawText, setRawText] = useState("");
  const [isParsingJD, setIsParsingJD] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [parsedData, setParsedData] = useState(null);

  // Manual input fields
  const [manualData, setManualData] = useState({
    company_name: "",
    job_title: "",
    team_name: "",
    location: "",
    responsibilities: "",
    requirements: "",
    nice_to_have: "",
    company_description: "",
  });

  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsParsingJD(true);
    setParseError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${API_BASE}/api/job-description/parse-file`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to parse file");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setParsedData(data.parsed);
      setInputMethod("review");
    } catch (error) {
      console.error("File parse error:", error);
      setParseError(error.message || "Failed to parse file. Please try again.");
    } finally {
      setIsParsingJD(false);
    }
  };

  const handleParseText = async () => {
    if (!rawText.trim() || rawText.trim().length < 50) {
      setParseError(
        "Please enter at least 50 characters of job description text.",
      );
      return;
    }

    setIsParsingJD(true);
    setParseError(null);

    try {
      const response = await fetch(`${API_BASE}/api/job-description/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: rawText,
          source_type: "text",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to parse text");
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setParsedData(data.parsed);
      setInputMethod("review");
    } catch (error) {
      console.error("Text parse error:", error);
      setParseError(error.message || "Failed to parse text. Please try again.");
    } finally {
      setIsParsingJD(false);
    }
  };

  const handleManualSubmit = () => {
    if (!manualData.job_title.trim()) {
      setParseError("Job title is required.");
      return;
    }

    const parsed = {
      company_name: manualData.company_name || null,
      job_title: manualData.job_title,
      team_name: manualData.team_name || null,
      location: manualData.location || null,
      responsibilities: manualData.responsibilities
        .split("\n")
        .filter((r) => r.trim()),
      requirements: manualData.requirements.split("\n").filter((r) => r.trim()),
      nice_to_have: manualData.nice_to_have.split("\n").filter((r) => r.trim()),
      company_description: manualData.company_description || null,
      confidence_score: 1.0,
    };

    setParsedData(parsed);
    setInputMethod("review");
  };

  const handleConfirm = () => {
    if (!parsedData) return;
    onJobDescriptionReady(parsedData);
  };

  const updateParsedField = (field, value) => {
    setParsedData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8 px-4 bg-gradient-to-br from-gray-50 to-purple-50">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Add Job Description
            </h1>
            <p className="text-gray-600 mt-1">
              Provide the job details for a personalized interview experience
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Display */}
        {parseError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-600 text-sm">{parseError}</p>
            </div>
            <button
              onClick={() => setParseError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input Methods */}
        {inputMethod !== "review" && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            {/* Method Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setInputMethod("paste")}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  inputMethod === "paste"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Paste Text
              </button>
              <button
                onClick={() => setInputMethod("upload")}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  inputMethod === "upload"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload File
              </button>
              <button
                onClick={() => setInputMethod("manual")}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                  inputMethod === "manual"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <Briefcase className="w-4 h-4 inline mr-2" />
                Enter Details
              </button>
            </div>

            {/* Paste Text */}
            {inputMethod === "paste" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paste Job Description
                </label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste the full job description here..."
                  className="w-full h-64 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                />
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-gray-500">
                    {rawText.length} characters
                  </span>
                  <button
                    onClick={handleParseText}
                    disabled={isParsingJD || rawText.length < 50}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isParsingJD ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Parsing...
                      </span>
                    ) : (
                      "Parse & Continue"
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Upload File */}
            {inputMethod === "upload" && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-colors"
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-700 font-medium mb-2">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-gray-500 text-sm">
                    PDF, DOCX, or TXT (max 5MB)
                  </p>
                </div>
                {isParsingJD && (
                  <div className="mt-4 flex items-center justify-center gap-2 text-purple-600">
                    <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    <span>Parsing document...</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual Entry */}
            {inputMethod === "manual" && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Job Title *
                    </label>
                    <input
                      type="text"
                      value={manualData.job_title}
                      onChange={(e) =>
                        setManualData((prev) => ({
                          ...prev,
                          job_title: e.target.value,
                        }))
                      }
                      placeholder="e.g., Senior Software Engineer"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      value={manualData.company_name}
                      onChange={(e) =>
                        setManualData((prev) => ({
                          ...prev,
                          company_name: e.target.value,
                        }))
                      }
                      placeholder="e.g., Google"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Team Name
                    </label>
                    <input
                      type="text"
                      value={manualData.team_name}
                      onChange={(e) =>
                        setManualData((prev) => ({
                          ...prev,
                          team_name: e.target.value,
                        }))
                      }
                      placeholder="e.g., Backend Infrastructure"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={manualData.location}
                      onChange={(e) =>
                        setManualData((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      placeholder="e.g., Remote / San Francisco"
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Key Responsibilities (one per line)
                  </label>
                  <textarea
                    value={manualData.responsibilities}
                    onChange={(e) =>
                      setManualData((prev) => ({
                        ...prev,
                        responsibilities: e.target.value,
                      }))
                    }
                    placeholder="Build scalable systems&#10;Design APIs&#10;Mentor junior engineers"
                    className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Requirements (one per line)
                  </label>
                  <textarea
                    value={manualData.requirements}
                    onChange={(e) =>
                      setManualData((prev) => ({
                        ...prev,
                        requirements: e.target.value,
                      }))
                    }
                    placeholder="5+ years Python experience&#10;Strong system design skills&#10;Experience with microservices"
                    className="w-full h-24 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nice to Have (one per line)
                  </label>
                  <textarea
                    value={manualData.nice_to_have}
                    onChange={(e) =>
                      setManualData((prev) => ({
                        ...prev,
                        nice_to_have: e.target.value,
                      }))
                    }
                    placeholder="Go or Rust experience&#10;Cloud platform expertise"
                    className="w-full h-20 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleManualSubmit}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {/* Review Parsed Data */}
        {inputMethod === "review" && parsedData && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Review Job Details
            </h2>

            {parsedData.confidence_score && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  Confidence Score:{" "}
                  <span className="font-semibold">
                    {Math.round(parsedData.confidence_score * 100)}%
                  </span>
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Briefcase className="w-4 h-4 inline mr-1" />
                    Job Title
                  </label>
                  <input
                    type="text"
                    value={parsedData.job_title || ""}
                    onChange={(e) =>
                      updateParsedField("job_title", e.target.value)
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Company
                  </label>
                  <input
                    type="text"
                    value={parsedData.company_name || ""}
                    onChange={(e) =>
                      updateParsedField("company_name", e.target.value)
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Team
                  </label>
                  <input
                    type="text"
                    value={parsedData.team_name || ""}
                    onChange={(e) =>
                      updateParsedField("team_name", e.target.value)
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <MapPin className="w-4 h-4 inline mr-1" />
                    Location
                  </label>
                  <input
                    type="text"
                    value={parsedData.location || ""}
                    onChange={(e) =>
                      updateParsedField("location", e.target.value)
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Responsibilities */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Responsibilities ({parsedData.responsibilities?.length || 0})
                </label>
                <div className="space-y-2">
                  {(parsedData.responsibilities || []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-gray-400">{idx + 1}.</span>
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Requirements */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requirements ({parsedData.requirements?.length || 0})
                </label>
                <div className="space-y-2">
                  {(parsedData.requirements || []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-green-500">•</span>
                      <span className="text-gray-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nice to Have */}
              {parsedData.nice_to_have?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nice to Have ({parsedData.nice_to_have.length})
                  </label>
                  <div className="space-y-2">
                    {parsedData.nice_to_have.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-blue-500">○</span>
                        <span className="text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setParsedData(null);
                  setInputMethod("paste");
                }}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Start Over
              </button>
              <button
                onClick={handleConfirm}
                disabled={isLoading || !parsedData.job_title}
                className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Starting Interview...
                  </span>
                ) : (
                  "Start Job-Specific Interview"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Introduction Display Component ====================
function IntroductionDisplay({ sequence, currentSegmentIndex, isPlaying }) {
  if (!sequence || sequence.length === 0) return null;

  const segmentLabels = {
    greeting: "Welcome",
    role_overview: "About the Role",
    responsibilities: "Key Responsibilities",
    requirements: "What We're Looking For",
    transition: "Let's Begin",
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-8 mb-6 shadow-lg border border-indigo-100">
      <div className="flex items-start gap-6">
        {/* Avatar / Speaker Indicator */}
        <div className="flex-shrink-0">
          <div
            className={`w-20 h-20 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-300 ${
              isPlaying ? "ring-4 ring-indigo-400 ring-opacity-50" : ""
            }`}
          >
            {isPlaying ? (
              <div className="flex items-end gap-1 h-8">
                <div
                  className="w-1.5 bg-indigo-600 rounded-full animate-bounce"
                  style={{ height: "12px", animationDelay: "0ms" }}
                />
                <div
                  className="w-1.5 bg-indigo-600 rounded-full animate-bounce"
                  style={{ height: "20px", animationDelay: "150ms" }}
                />
                <div
                  className="w-1.5 bg-indigo-600 rounded-full animate-bounce"
                  style={{ height: "16px", animationDelay: "300ms" }}
                />
                <div
                  className="w-1.5 bg-indigo-600 rounded-full animate-bounce"
                  style={{ height: "24px", animationDelay: "450ms" }}
                />
              </div>
            ) : (
              <Mic className="w-10 h-10 text-indigo-600" />
            )}
          </div>
        </div>

        {/* Introduction Content */}
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 mb-6">
            Interview Introduction
          </h3>

          <div className="space-y-4">
            {sequence.map((segment, index) => {
              const isCurrent = currentSegmentIndex === index;
              const isPast = currentSegmentIndex > index;

              return (
                <div
                  key={segment.order}
                  className={`p-4 rounded-xl transition-all duration-500 ${
                    isCurrent
                      ? "bg-white shadow-md scale-[1.02] border-l-4 border-indigo-500"
                      : isPast
                        ? "bg-white/50 opacity-60"
                        : "bg-white/30 opacity-40"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold uppercase tracking-wide mb-2 ${
                      isCurrent
                        ? "text-indigo-600"
                        : isPast
                          ? "text-gray-500"
                          : "text-gray-400"
                    }`}
                  >
                    {segmentLabels[segment.segment_type] ||
                      segment.segment_type.replace("_", " ")}
                  </p>
                  <p
                    className={`text-base leading-relaxed ${
                      isCurrent
                        ? "text-gray-900"
                        : isPast
                          ? "text-gray-600"
                          : "text-gray-500"
                    }`}
                  >
                    {segment.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Progress indicator */}
          <div className="mt-6 flex items-center gap-2">
            {sequence.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  index <= currentSegmentIndex
                    ? "bg-indigo-600 w-8"
                    : "bg-gray-300 w-4"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== AI Response Display Component ====================
function AIResponseDisplay({ aiResponse, isPlaying, currentAudioLabel }) {
  if (!aiResponse) return null;

  const isPlayingAck = isPlaying && currentAudioLabel === "acknowledgment";
  const isPlayingProbe = isPlaying && currentAudioLabel === "follow_up_probe";
  const isPlayingTransition = isPlaying && currentAudioLabel === "transition";

  return (
    <div className="ai-response-container mb-6 space-y-3 animate-fade-in">
      {aiResponse.acknowledgment && (
        <div
          className={`bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-4 rounded-r-lg transition-all duration-300 ${isPlayingAck ? "ring-2 ring-blue-400 ring-opacity-50" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 ${isPlayingAck ? "animate-pulse" : ""}`}
            >
              {isPlayingAck ? (
                <div className="flex gap-0.5">
                  <div
                    className="w-1 h-3 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-1 h-4 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-1 h-3 bg-blue-600 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              ) : (
                <Mic className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Interviewer:
              </p>
              <p className="text-base text-gray-900 leading-relaxed">
                {aiResponse.acknowledgment.text}
              </p>
            </div>
          </div>
        </div>
      )}

      {aiResponse.follow_up_probe && (
        <div
          className={`bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg transition-all duration-300 ${isPlayingProbe ? "ring-2 ring-yellow-400 ring-opacity-50" : ""}`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0 ${isPlayingProbe ? "animate-pulse" : ""}`}
            >
              <MessageSquare className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-900 mb-1">
                Follow-up Question:
              </p>
              <p className="text-base text-yellow-800 leading-relaxed">
                {aiResponse.follow_up_probe.text}
              </p>
            </div>
          </div>
        </div>
      )}

      {aiResponse.transition && (
        <div
          className={`bg-green-50 border-l-4 border-green-400 p-3 rounded-r-lg transition-all duration-300 ${isPlayingTransition ? "ring-2 ring-green-400 ring-opacity-50" : ""}`}
        >
          <p className="text-sm text-green-800 italic">
            {aiResponse.transition.text}
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== Speaking Indicator Component ====================
function SpeakingIndicator({ isPlaying, currentLabel }) {
  if (!isPlaying) return null;

  const labels = {
    acknowledgment: "Responding to your answer...",
    follow_up_probe: "Asking a follow-up...",
    transition: "Transitioning...",
    interviewer_comment: "Making a comment...",
    question: "Asking the next question...",
    greeting: "Welcoming you...",
    role_overview: "Describing the role...",
    responsibilities: "Explaining responsibilities...",
    requirements: "Discussing requirements...",
  };

  return (
    <div className="flex items-center gap-3 text-blue-600 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200 animate-fade-in">
      <div className="flex gap-1">
        <div
          className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <div
          className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <div
          className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </div>
      <span className="text-sm font-medium">
        {labels[currentLabel] || "AI is speaking..."}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <Volume2 className="w-4 h-4 animate-pulse" />
      </div>
    </div>
  );
}

// ==================== Audio Controls Component ====================
function AudioControls({
  audioEnabled,
  setAudioEnabled,
  isPlaying,
  onSkipAudio,
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <button
        onClick={() => setAudioEnabled(!audioEnabled)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
          audioEnabled
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
        title={audioEnabled ? "Turn off AI voice" : "Turn on AI voice"}
      >
        {audioEnabled ? (
          <Volume2 className="w-4 h-4" />
        ) : (
          <VolumeX className="w-4 h-4" />
        )}
        <span className="text-sm font-medium">
          {audioEnabled ? "Voice On" : "Voice Off"}
        </span>
      </button>

      {isPlaying && (
        <button
          onClick={onSkipAudio}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          title="Skip current audio (Esc)"
        >
          <SkipForward className="w-4 h-4" />
          <span className="text-sm">Skip</span>
        </button>
      )}

      {isPlaying && (
        <div className="flex items-center gap-2 text-sm text-gray-600 ml-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Playing AI response
        </div>
      )}

      <div className="ml-auto text-xs text-gray-400">
        Shift+Space: Toggle audio | Esc: Skip
      </div>
    </div>
  );
}

// ==================== Follow-Up Input Component ====================
function FollowUpInput({
  onSubmit,
  isRecording,
  onStartRecording,
  onStopRecording,
  transcript,
  isTranscribing,
}) {
  return (
    <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-yellow-600" />
        <h3 className="text-lg font-semibold text-yellow-900">
          Please provide more details
        </h3>
      </div>
      <p className="text-sm text-yellow-700 mb-4">
        The interviewer would like you to elaborate on your previous answer.
      </p>

      {transcript && (
        <div className="bg-white rounded-lg p-4 mb-4 border border-yellow-200">
          <p className="text-sm text-gray-700">{transcript}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!isRecording ? (
          <button
            onClick={onStartRecording}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
          >
            <Mic className="w-4 h-4" />
            Start Recording
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors animate-pulse"
          >
            <div className="w-3 h-3 bg-white rounded-full" />
            Stop Recording
          </button>
        )}

        {isTranscribing && (
          <span className="text-sm text-yellow-700">Transcribing...</span>
        )}
      </div>
    </div>
  );
}

// ==================== Main Interview Component ====================
export default function Interview() {
  const navigate = useNavigate();

  // ----- Interview Type Selection -----
  const [interviewStage, setInterviewStage] = useState("select"); // 'select' | 'jd_input' | 'jd_intro' | 'active' | 'general_loading'
  const [interviewType, setInterviewType] = useState(null); // 'general' | 'job_specific'

  // ----- Job Description Flow -----
  const [hasJobDescription, setHasJobDescription] = useState(false);
  const [jobDescription, setJobDescription] = useState(null);
  const [introductionSequence, setIntroductionSequence] = useState([]);
  const [isPlayingIntroduction, setIsPlayingIntroduction] = useState(false);
  const [currentIntroSegmentIndex, setCurrentIntroSegmentIndex] = useState(-1);
  const [firstQuestion, setFirstQuestion] = useState(null);

  // ----- Interview plan + pointer -----
  const [plan, setPlan] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ----- Recording + STT -----
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  // ----- Per-question UX -----
  const [showThinkTime, setShowThinkTime] = useState(false);
  const [thinkTimeLeft, setThinkTimeLeft] = useState(3);
  const [repeatCount, setRepeatCount] = useState(0);

  // ----- Devices -----
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  // ----- Audio graph for waveform -----
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // ----- MediaRecorder + buffers -----
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // ----- Timers + recognizer -----
  const thinkTimerRef = useRef(null);
  const recognitionRef = useRef(null);

  // ----- Results we'll save for feedback -----
  const [answers, setAnswers] = useState([]);

  // What to do after transcription finishes
  const pendingNavRef = useRef(null);

  // ----- Session & Answer Saving -----
  const [sessionId, setSessionId] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const saveStatusTimeoutRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

  // ----- Phase 1.3: Intelligent Question Generation -----
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [interviewerComment, setInterviewerComment] = useState(null);
  const [questionReferences, setQuestionReferences] = useState(null);
  const [questionMetadata, setQuestionMetadata] = useState(null);
  const [conversationStage, setConversationStage] = useState("early");
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [useIntelligentFlow, setUseIntelligentFlow] = useState(true);

  // ----- Voice Interactions -----
  const [aiResponse, setAiResponse] = useState(null);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [audioQueue, setAudioQueue] = useState([]);
  const [currentAudioLabel, setCurrentAudioLabel] = useState(null);
  const [flowControl, setFlowControl] = useState(null);
  const [awaitingFollowUp, setAwaitingFollowUp] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    document.title = "InterVue Labs > Interview";
  }, []);

  useEffect(() => {
    return () => {
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, []);

  // ------------ Handle Interview Type Selection ------------
  const handleSelectGeneral = () => {
    setInterviewType("general");
    setInterviewStage("general_loading");
    loadGeneralInterviewPlan();
  };

  const handleSelectJobSpecific = () => {
    setInterviewType("job_specific");
    setInterviewStage("jd_input");
  };

  const loadGeneralInterviewPlan = () => {
    const rawPlan = localStorage.getItem(PLAN_KEY);

    if (!rawPlan) {
      setLoadError(
        "We don't have an interview plan yet. Upload your resume, run the resume analysis, then start an interview from there.",
      );
      setInterviewStage("select");
      return;
    }

    try {
      const parsed = JSON.parse(rawPlan);
      if (!parsed?.questions || !parsed.questions.length) {
        setLoadError(
          "Your interview plan looks empty. Please generate questions again from the resume analysis page.",
        );
        setInterviewStage("select");
        return;
      }
      setPlan(parsed);
      setInterviewStage("active");
    } catch (err) {
      console.error("Failed to parse interview plan:", err);
      setLoadError(
        "We couldn't read your interview plan. Try generating a fresh set of questions from your resume.",
      );
      setInterviewStage("select");
    }
  };

  // ------------ Start Interview With Job Description ------------
  const startInterviewWithJobDescription = async (jdData) => {
    setIsLoading(true);
    setJobDescription(jdData);

    try {
      const response = await fetch(
        `${API_BASE}/api/interview/start-with-job-description`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: jdData.job_title,
            difficulty: "medium",
            job_description: jdData,
            candidate_name: null,
            candidate_resume_summary: null,
            generate_audio: audioEnabled,
            introduction_mode: "concise",
            question_count: 10,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start interview");
      }

      const data = await response.json();
      console.log("Interview started with JD:", data);

      // Store session
      setSessionId(data.session_id);
      setHasJobDescription(true);

      // Store introduction sequence
      setIntroductionSequence(data.introduction_sequence || []);

      // Store first question
      setFirstQuestion(data.first_question);

      // Create a minimal plan for the interview
      setPlan({
        meta: {
          role: jdData.job_title,
          difficulty: "medium",
          questionCount: 10,
        },
        questions: [
          {
            id: 1,
            prompt: data.first_question?.text || "Tell me about yourself.",
            type: "introduction",
            interviewer: "AI Interviewer",
          },
        ],
      });

      // Move to introduction stage
      setInterviewStage("jd_intro");

      // Start playing introduction
      if (data.introduction_sequence?.length > 0 && audioEnabled) {
        playIntroductionSequence(data.introduction_sequence);
      } else {
        // Skip to first question if no audio
        setTimeout(() => {
          finishIntroductionAndStartInterview(data.first_question);
        }, 2000);
      }
    } catch (error) {
      console.error("Error starting interview with JD:", error);
      setLoadError("Failed to start interview. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // ------------ Introduction Playback ------------
  const playIntroductionSequence = (sequence) => {
    setIsPlayingIntroduction(true);
    setCurrentIntroSegmentIndex(0);

    // Build audio queue from introduction segments
    const introAudio = sequence
      .sort((a, b) => a.order - b.order)
      .filter((segment) => segment.audio_url)
      .map((segment) => ({
        url: segment.audio_url,
        label: segment.segment_type,
        text: segment.text,
        order: segment.order,
      }));

    if (introAudio.length > 0) {
      enqueueAudio(introAudio);
    } else {
      // No audio, finish introduction after delay
      setTimeout(() => {
        finishIntroductionAndStartInterview(firstQuestion);
      }, 3000);
    }
  };

  const finishIntroductionAndStartInterview = (firstQ) => {
    setIsPlayingIntroduction(false);
    setCurrentIntroSegmentIndex(-1);

    if (firstQ) {
      setCurrentQuestion({
        id: firstQ.question_id || 1,
        text: firstQ.text,
        intent: firstQ.intent || "introduction",
        type: firstQ.type || "standard",
        audio_url: firstQ.audio_url,
      });
    }

    setInterviewStage("active");
  };

  // Track introduction segment playback
  useEffect(() => {
    if (isPlayingIntroduction && currentAudioLabel) {
      const segmentIndex = introductionSequence.findIndex(
        (s) => s.segment_type === currentAudioLabel,
      );
      if (segmentIndex !== -1) {
        setCurrentIntroSegmentIndex(segmentIndex);
      }
    }
  }, [currentAudioLabel, isPlayingIntroduction, introductionSequence]);

  // Handle introduction completion
  useEffect(() => {
    if (
      audioQueue.length === 0 &&
      isPlayingIntroduction &&
      !isAISpeaking &&
      interviewStage === "jd_intro"
    ) {
      // Introduction finished, now show first question
      setTimeout(() => {
        finishIntroductionAndStartInterview(firstQuestion);
      }, 1000);
    }
  }, [
    audioQueue.length,
    isPlayingIntroduction,
    isAISpeaking,
    interviewStage,
    firstQuestion,
  ]);

  // Get current question
  const q = useMemo(() => {
    if (!plan || !plan.questions) return null;

    if (useIntelligentFlow && currentQuestion) {
      const staticQ = plan.questions[currentIdx];
      return {
        ...staticQ,
        id: currentQuestion.id || staticQ?.id || currentIdx + 1,
        prompt: currentQuestion.text || staticQ?.prompt,
        type: currentQuestion.type || staticQ?.type || "standard",
        intent: currentQuestion.intent || staticQ?.type || "general",
        interviewer: staticQ?.interviewer || "AI Interviewer",
      };
    }

    return plan.questions[currentIdx];
  }, [plan, currentIdx, currentQuestion, useIntelligentFlow]);

  const total = plan?.meta?.questionCount || plan?.questions?.length || 0;

  // ------------ Audio Queue Processor ------------
  useEffect(() => {
    if (audioQueue.length > 0 && !isAISpeaking && audioEnabled) {
      playNextAudio();
    }
  }, [audioQueue, isAISpeaking, audioEnabled]);

  const playNextAudio = useCallback(() => {
    if (audioQueue.length === 0 || !audioEnabled) return;

    const nextAudio = audioQueue[0];
    setCurrentAudioLabel(nextAudio.label);
    setIsAISpeaking(true);

    if (audioPlayerRef.current) {
      const audioUrl = nextAudio.url.startsWith("http")
        ? nextAudio.url
        : `${API_BASE}${nextAudio.url}`;

      console.log("Playing audio:", nextAudio.label, audioUrl);
      audioPlayerRef.current.src = audioUrl;
      audioPlayerRef.current
        .play()
        .then(() => {
          console.log("Audio playing:", nextAudio.label);
        })
        .catch((error) => {
          console.error("Audio playback failed:", error);
          handleAudioEnded();
        });
    }
  }, [audioQueue, audioEnabled]);

  const handleAudioEnded = useCallback(() => {
    setIsAISpeaking(false);
    setCurrentAudioLabel(null);
    setAudioQueue((prev) => prev.slice(1));
  }, []);

  const skipCurrentAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    handleAudioEnded();
  }, [handleAudioEnded]);

  const enqueueAudio = useCallback(
    (audioItems) => {
      if (!audioEnabled) return;
      const validItems = audioItems.filter((item) => item.url);
      if (validItems.length > 0) {
        setAudioQueue((prev) => [...prev, ...validItems]);
      }
    },
    [audioEnabled],
  );

  const clearAudioQueue = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
    }
    setAudioQueue([]);
    setIsAISpeaking(false);
    setCurrentAudioLabel(null);
  }, []);

  // ------------ Keyboard Shortcuts ------------
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === "Space" && e.shiftKey) {
        e.preventDefault();
        setAudioEnabled((prev) => !prev);
      }

      if (e.code === "Escape" && isAISpeaking) {
        e.preventDefault();
        skipCurrentAudio();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [isAISpeaking, skipCurrentAudio]);

  // ------------ Create interview session for general interview ------------
  useEffect(() => {
    if (interviewStage !== "active" || interviewType !== "general") return;
    if (!plan || sessionId || isCreatingSession) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      try {
        const interviewerNames = [
          ...new Set(plan.questions.map((q) => q.interviewer).filter(Boolean)),
        ];

        const response = await fetch(
          `${API_BASE}/api/interview/session/create`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: plan.meta?.role || "Candidate",
              difficulty: plan.meta?.difficulty || "Junior",
              question_count: plan.questions.length,
              interviewer_names: interviewerNames,
              plan: plan,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to create interview session");
        }

        const data = await response.json();
        setSessionId(data.session_id);
        console.log("Interview session created:", data.session_id);
      } catch (err) {
        console.error("Failed to create interview session:", err);
      } finally {
        setIsCreatingSession(false);
      }
    };

    createSession();
  }, [plan, sessionId, isCreatingSession, interviewStage, interviewType]);

  // ------------ Fetch initial question for general interview ------------
  useEffect(() => {
    if (interviewStage !== "active" || interviewType !== "general") return;
    if (!sessionId || !plan || !useIntelligentFlow || currentQuestion) return;

    const fetchInitialQuestion = async () => {
      setIsLoadingQuestion(true);
      try {
        const response = await fetch(
          `${API_BASE}/api/interview/start-with-audio`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              session_id: sessionId,
              role: plan.meta?.role || "Software Engineer",
              difficulty: plan.meta?.difficulty || "medium",
              total_questions: plan.questions?.length || 10,
              generate_audio: audioEnabled,
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.question) {
            setCurrentQuestion(data.question);
            setInterviewerComment(data.interviewer_comment);
            setQuestionReferences(data.references);
            setQuestionMetadata(data.metadata);
            setConversationStage(data.metadata?.conversation_stage || "early");

            const audioItems = [];
            if (data.welcome_audio_url) {
              audioItems.push({
                url: data.welcome_audio_url,
                label: "interviewer_comment",
              });
            }
            if (data.question?.audio_url) {
              audioItems.push({
                url: data.question.audio_url,
                label: "question",
              });
            }
            if (audioItems.length > 0) {
              enqueueAudio(audioItems);
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial question:", err);
      } finally {
        setIsLoadingQuestion(false);
      }
    };

    fetchInitialQuestion();
  }, [
    sessionId,
    plan,
    useIntelligentFlow,
    currentQuestion,
    audioEnabled,
    interviewStage,
    interviewType,
  ]);

  // ------------ Get user media ------------
  useEffect(() => {
    if (interviewStage !== "active" && interviewStage !== "jd_intro") return;

    let mounted = true;

    (async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (!mounted) return;
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsCameraOn(true);
        setIsMicOn(true);
        setPermissionError(null);

        audioContextRef.current = new (
          window.AudioContext || window.webkitAudioContext
        )();
        const source =
          audioContextRef.current.createMediaStreamSource(mediaStream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);
      } catch (e) {
        console.error("Media permission error:", e.name, e.message);
        setPermissionError(
          "Please allow camera and microphone permissions, then reload.",
        );
      }
    })();

    return () => {
      mounted = false;
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setIsCameraOn(false);
      setIsMicOn(false);
      try {
        audioContextRef.current?.close();
      } catch {}
      audioContextRef.current = null;
      analyserRef.current = null;
    };
  }, [interviewStage]);

  // ------------ Web Speech API ------------
  useEffect(() => {
    if (
      !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    ) {
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event) => {
      let liveText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r[0] && r[0].transcript) {
          liveText += r[0].transcript + " ";
        }
      }
      setTranscript(liveText.trim());
    };

    rec.onerror = (e) => {
      console.warn("SpeechRecognition error:", e.error);
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {}
    };
  }, []);

  // TTS fallback
  const voiceReady = async () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.getVoices().length > 0) return;
    await new Promise((resolve) => {
      const handler = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
    });
  };

  const speak = async (text) => {
    if (!("speechSynthesis" in window) || !text || !audioEnabled) return;
    await voiceReady();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) =>
      /en-US|en_GB|English/i.test(v.lang || v.name),
    );
    if (en) u.voice = en;
    u.rate = 0.95;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  };

  const cleanTranscript = (raw) => {
    if (!raw) return "";
    let t = raw.trim();
    const lower = t.toLowerCase();
    const junkPhrases = [
      "i don't know why",
      "i dont know why",
      "i don't know",
      "i dont know",
    ];
    if (junkPhrases.includes(lower)) return "";
    if (lower.includes("know why") && t.length < 25) return "";
    return t;
  };

  // Recording functions
  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      alert(
        "Microphone not ready. Please allow mic access and reload the page.",
      );
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) {
      alert(
        "No audio track found. Please check microphone permissions and reload.",
      );
      return;
    }

    try {
      recordedChunksRef.current = [];
      setTranscript("");
      setIsTranscribing(false);
      recordingStartTimeRef.current = Date.now();

      const audioOnlyStream = new MediaStream(audioTracks);
      const mr = new MediaRecorder(audioOnlyStream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        setIsTranscribing(true);
        let cleaned = "";

        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          if (!blob || blob.size === 0) {
            setTranscript("No audio detected. Please try again.");
            return;
          }

          const form = new FormData();
          form.append("file", blob, `answer-q${currentIdx + 1}.webm`);

          const res = await fetch(`${API_BASE}/api/transcribe`, {
            method: "POST",
            body: form,
          });

          if (!res.ok) throw new Error("STT request failed");

          const data = await res.json();
          cleaned = cleanTranscript(data.transcript || "");
          setTranscript(cleaned);
        } catch (err) {
          console.error("Transcription failed:", err);
          setTranscript(
            "Could not transcribe audio. Please try speaking again.",
          );
        } finally {
          setIsTranscribing(false);
        }

        const action = pendingNavRef.current;
        pendingNavRef.current = null;

        const merged = buildAnswersWithCurrent(cleaned);

        if (action === "next") {
          advanceToNextQuestion(merged);
        } else if (action === "end") {
          finalizeAndExitInterview(merged);
        } else if (action === "followup") {
          handleFollowUpSubmitInternal(cleaned);
        }
      };

      mr.start();
      setIsRecording(true);
    } catch (e) {
      console.error("MediaRecorder start failed:", e);
      alert(
        "Could not start recording. Please check your microphone permissions.",
      );
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {
      console.warn("MediaRecorder stop error:", e);
    }
    setIsRecording(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  };

  const buildAnswersWithCurrent = (answerOverride) => {
    if (!q) return answers;
    const userAnswer = (answerOverride ?? transcript ?? "").trim();

    const entry = {
      id: q.id,
      prompt: q.prompt,
      interviewer: q.interviewer,
      type: q.type,
      userAnswer,
      idealAnswer: q.idealAnswer || "",
    };

    const next = [...answers];
    const ix = next.findIndex((a) => a.id === q.id);
    if (ix >= 0) next[ix] = entry;
    else next.push(entry);

    setAnswers(next);
    return next;
  };

  // Think time
  useEffect(() => {
    if (!q || interviewStage !== "active") return;
    if (!streamRef.current) return;
    if (isAISpeaking || audioQueue.length > 0) return;

    setShowThinkTime(true);
    setThinkTimeLeft(3);
    setRepeatCount(0);
    setTranscript("");
    setIsRecording(false);
    setIsTranscribing(false);
    setAwaitingFollowUp(false);
    setAiResponse(null);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, [q?.id, stream, interviewStage]);

  useEffect(() => {
    if (!showThinkTime) return;
    if (thinkTimeLeft <= 0) {
      setShowThinkTime(false);
      const questionText =
        useIntelligentFlow && currentQuestion?.text
          ? currentQuestion.text
          : q?.prompt || "";

      if (!currentQuestion?.audio_url) {
        speak(questionText);
      }
      startRecording();
      return;
    }

    thinkTimerRef.current = setTimeout(
      () => setThinkTimeLeft((t) => t - 1),
      1000,
    );
    return () => clearTimeout(thinkTimerRef.current);
  }, [
    showThinkTime,
    thinkTimeLeft,
    q?.prompt,
    currentQuestion?.text,
    useIntelligentFlow,
  ]);

  const handleRepeat = () => {
    if (!q || repeatCount >= 2) return;
    setRepeatCount((c) => c + 1);

    const questionText =
      useIntelligentFlow && currentQuestion?.text
        ? currentQuestion.text
        : q.prompt;

    if (currentQuestion?.audio_url && audioEnabled) {
      enqueueAudio([{ url: currentQuestion.audio_url, label: "question" }]);
    } else {
      speak(questionText);
    }
  };

  // Answer submission
  const submitAnswerRealtime = async (answerEntry) => {
    if (!sessionId) return null;

    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }

    setSaveStatus("saving");
    setIsLoadingQuestion(true);

    try {
      let audioDuration = null;
      if (recordingStartTimeRef.current) {
        audioDuration = (Date.now() - recordingStartTimeRef.current) / 1000;
        recordingStartTimeRef.current = null;
      }

      const response = await fetch(
        `${API_BASE}/api/interview/submit-answer-realtime`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            question_id: answerEntry.id,
            question_text: answerEntry.prompt,
            question_intent:
              currentQuestion?.intent || answerEntry.type || "general",
            role: plan?.meta?.role || "Software Engineer",
            user_answer: answerEntry.userAnswer,
            transcript_raw: answerEntry.userAnswer,
            audio_duration_seconds: audioDuration,
            difficulty: plan?.meta?.difficulty || "medium",
            total_questions: plan?.questions?.length || 10,
            generate_audio: audioEnabled,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to submit answer");

      const data = await response.json();

      setSaveStatus("saved");
      saveStatusTimeoutRef.current = setTimeout(
        () => setSaveStatus(null),
        2000,
      );

      setAiResponse(data.ai_response);
      setFlowControl(data.flow_control);

      const audioItems = [];

      if (data.ai_response?.acknowledgment?.audio_url) {
        audioItems.push({
          url: data.ai_response.acknowledgment.audio_url,
          label: "acknowledgment",
        });
      }
      if (data.ai_response?.follow_up_probe?.audio_url) {
        audioItems.push({
          url: data.ai_response.follow_up_probe.audio_url,
          label: "follow_up_probe",
        });
      }
      if (data.ai_response?.transition?.audio_url) {
        audioItems.push({
          url: data.ai_response.transition.audio_url,
          label: "transition",
        });
      }

      if (data.flow_control?.should_proceed_to_next && data.next_question) {
        if (data.next_question.interviewer_comment_audio_url) {
          audioItems.push({
            url: data.next_question.interviewer_comment_audio_url,
            label: "interviewer_comment",
          });
        }
        if (data.next_question.question?.audio_url) {
          audioItems.push({
            url: data.next_question.question.audio_url,
            label: "question",
          });
        }

        setCurrentQuestion(data.next_question.question);
        setInterviewerComment(data.next_question.interviewer_comment);
        setQuestionReferences(data.next_question.references);
        setQuestionMetadata(data.next_question.metadata);
        setConversationStage(
          data.next_question.metadata?.conversation_stage || "mid",
        );
        setAwaitingFollowUp(false);
      } else if (data.ai_response?.follow_up_probe) {
        setAwaitingFollowUp(true);
      }

      if (audioItems.length > 0) {
        enqueueAudio(audioItems);
      }

      return data;
    } catch (err) {
      console.error("Failed to submit answer:", err);
      setSaveStatus("error");
      saveStatusTimeoutRef.current = setTimeout(
        () => setSaveStatus(null),
        3000,
      );
      return null;
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleFollowUpSubmitInternal = async (followUpAnswer) => {
    if (!sessionId || !followUpAnswer) return;

    setIsLoadingQuestion(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/interview/submit-followup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            original_question_id: currentQuestion?.id || q?.id,
            follow_up_answer: followUpAnswer,
            role: plan?.meta?.role || "Software Engineer",
            difficulty: plan?.meta?.difficulty || "medium",
            generate_audio: audioEnabled,
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to submit follow-up");

      const data = await response.json();

      setAwaitingFollowUp(false);
      setAiResponse(data.ai_response);

      const audioItems = [];

      if (data.ai_response?.acknowledgment?.audio_url) {
        audioItems.push({
          url: data.ai_response.acknowledgment.audio_url,
          label: "acknowledgment",
        });
      }
      if (data.ai_response?.transition?.audio_url) {
        audioItems.push({
          url: data.ai_response.transition.audio_url,
          label: "transition",
        });
      }

      if (data.next_question) {
        if (data.next_question.interviewer_comment_audio_url) {
          audioItems.push({
            url: data.next_question.interviewer_comment_audio_url,
            label: "interviewer_comment",
          });
        }
        if (data.next_question.question?.audio_url) {
          audioItems.push({
            url: data.next_question.question.audio_url,
            label: "question",
          });
        }

        setCurrentQuestion(data.next_question.question);
        setInterviewerComment(data.next_question.interviewer_comment);
        setQuestionReferences(data.next_question.references);
        setQuestionMetadata(data.next_question.metadata);
        setConversationStage(
          data.next_question.metadata?.conversation_stage || "mid",
        );
      }

      if (audioItems.length > 0) {
        enqueueAudio(audioItems);
      }
    } catch (err) {
      console.error("Failed to submit follow-up:", err);
      setAwaitingFollowUp(false);
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleFollowUpSubmit = () => {
    if (isRecording) {
      pendingNavRef.current = "followup";
      stopRecording();
    }
  };

  const advanceToNextQuestion = async (mergedAnswers) => {
    if (!plan || !q) return;

    const currentAnswer = mergedAnswers.find((a) => a.id === q.id);
    const totalQuestions = plan.questions.length;
    const isLastQuestion = currentIdx + 1 >= totalQuestions;

    if (currentAnswer && sessionId) {
      await submitAnswerRealtime(currentAnswer);
    }

    if (!isLastQuestion && !awaitingFollowUp) {
      setCurrentIdx((i) => i + 1);
      setTranscript("");
      setAnswers(mergedAnswers);
      setRepeatCount(0);

      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsRecording(false);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (isLastQuestion && !awaitingFollowUp) {
      finalizeAndExitInterview(mergedAnswers);
    }
  };

  const finalizeAndExitInterview = async (mergedAnswers) => {
    clearAudioQueue();

    if (q) {
      const lastAnswer = mergedAnswers.find((a) => a.id === q.id);
      if (lastAnswer && sessionId) {
        await submitAnswerRealtime(lastAnswer);
      }
    }

    try {
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
    } catch {}

    streamRef.current = null;
    setStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);

    try {
      audioContextRef.current?.close();
    } catch {}
    audioContextRef.current = null;
    analyserRef.current = null;

    if (sessionId) {
      localStorage.setItem("interviewSessionId", sessionId);
    }

    if (plan) {
      const payload = { meta: { ...plan.meta, sessionId: sessionId } };
      localStorage.setItem(RESULTS_KEY, JSON.stringify(payload));
    }

    navigate("/feedback");
  };

  const handleNext = async () => {
    if (!plan || !q) return;

    if (isRecording) {
      pendingNavRef.current = "next";
      stopRecording();
      return;
    }

    const merged = buildAnswersWithCurrent();
    await advanceToNextQuestion(merged);
  };

  const handleEndInterview = async () => {
    if (!plan || !q) {
      navigate("/resume-analysis");
      return;
    }

    if (isRecording) {
      pendingNavRef.current = "end";
      stopRecording();
      return;
    }

    const merged = buildAnswersWithCurrent();
    await finalizeAndExitInterview(merged);
  };

  // ==================== RENDER ====================

  // Interview Type Selection
  if (interviewStage === "select") {
    return (
      <InterviewTypeSelection
        onSelectGeneral={handleSelectGeneral}
        onSelectJobSpecific={handleSelectJobSpecific}
      />
    );
  }

  // Job Description Input
  if (interviewStage === "jd_input") {
    return (
      <JobDescriptionInput
        onJobDescriptionReady={startInterviewWithJobDescription}
        onCancel={() => setInterviewStage("select")}
        isLoading={isLoading}
      />
    );
  }

  // General Interview Loading
  if (interviewStage === "general_loading") {
    return (
      <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 bg-gray-50">
        <Spinner message="Loading your interview..." />
      </div>
    );
  }

  // Job Description Introduction
  if (interviewStage === "jd_intro") {
    return (
      <div className="min-h-[calc(100vh-8rem)] py-6 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-4xl mx-auto">
          <audio
            ref={audioPlayerRef}
            onEnded={handleAudioEnded}
            onError={handleAudioEnded}
            className="hidden"
          />

          <AudioControls
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            isPlaying={isAISpeaking}
            onSkipAudio={skipCurrentAudio}
          />

          {/* Glowing Orb - AI Speaking Indicator */}
          <div className="flex flex-col items-center justify-center min-h-[160px] sm:min-h-[180px] mb-4">
            <GlowingOrb
              isActive={isAISpeaking}
              size={
                typeof window !== "undefined" && window.innerWidth < 640
                  ? 100
                  : 120
              }
              className="transition-opacity duration-300"
            />
            {isAISpeaking && (
              <p className="mt-4 text-sm text-indigo-600 font-medium animate-pulse">
                AI is speaking...
              </p>
            )}
            {!isAISpeaking && !isPlayingIntroduction && (
              <p className="text-sm text-gray-500">Waiting to begin...</p>
            )}
          </div>

          <IntroductionDisplay
            sequence={introductionSequence}
            currentSegmentIndex={currentIntroSegmentIndex}
            isPlaying={isPlayingIntroduction}
          />

          {!isAISpeaking && !isPlayingIntroduction && (
            <div className="text-center mt-8">
              <button
                onClick={() =>
                  finishIntroductionAndStartInterview(firstQuestion)
                }
                className="px-8 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Start Interview
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Can't start the interview yet
          </h1>
          <p className="text-gray-600 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => setInterviewStage("select")}
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (!plan || !q) {
    return (
      <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 bg-gray-50">
        <Spinner />
      </div>
    );
  }

  // Active Interview
  return (
    <div className="min-h-[calc(100vh-8rem)] py-6 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto space-y-6">
        <audio
          ref={audioPlayerRef}
          onEnded={handleAudioEnded}
          onError={handleAudioEnded}
          className="hidden"
        />

        <AudioControls
          audioEnabled={audioEnabled}
          setAudioEnabled={setAudioEnabled}
          isPlaying={isAISpeaking}
          onSkipAudio={skipCurrentAudio}
        />

        {/* Glowing Orb - AI Speaking Indicator */}
        <div className="flex flex-col items-center justify-center min-h-[140px] sm:min-h-[160px] mb-2">
          <GlowingOrb
            isActive={isAISpeaking}
            size={
              typeof window !== "undefined" && window.innerWidth < 640
                ? 100
                : 120
            }
            className="transition-opacity duration-300"
          />
          {isAISpeaking && (
            <p className="mt-3 text-sm text-indigo-600 font-medium animate-pulse">
              {currentAudioLabel === "question"
                ? "Asking question..."
                : currentAudioLabel === "acknowledgment"
                  ? "Responding..."
                  : currentAudioLabel === "follow_up_probe"
                    ? "Follow-up question..."
                    : "AI is speaking..."}
            </p>
          )}
        </div>

        <AIResponseDisplay
          aiResponse={aiResponse}
          isPlaying={isAISpeaking}
          currentAudioLabel={currentAudioLabel}
        />

        {/* Job Description Badge */}
        {hasJobDescription && jobDescription && (
          <div className="flex items-center justify-between bg-purple-50 rounded-lg px-4 py-2 shadow-sm border border-purple-100">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-medium text-purple-700">
                  Job-Specific Interview
                </span>
              </div>
              <span className="text-xs text-purple-400">|</span>
              <span className="text-xs text-purple-600">
                {jobDescription.job_title}
                {jobDescription.company_name &&
                  ` at ${jobDescription.company_name}`}
              </span>
            </div>
          </div>
        )}

        {/* Conversation Status */}
        {useIntelligentFlow && questionMetadata && (
          <div className="flex items-center justify-between bg-white rounded-lg px-4 py-2 shadow-sm border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-medium text-gray-600">
                  AI-Powered Interview
                </span>
              </div>
              <span className="text-xs text-gray-400">|</span>
              <span className="text-xs text-gray-500">
                Stage:{" "}
                <span className="font-medium capitalize">
                  {conversationStage}
                </span>
              </span>
            </div>
            {questionMetadata?.patterns_detected?.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-indigo-600 font-medium">
                  {questionMetadata.patterns_detected.length} pattern(s)
                  detected
                </span>
              </div>
            )}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          <UserCameraPanel
            stream={stream}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            onToggleCamera={() => {
              if (!streamRef.current) return;
              const [track] = streamRef.current.getVideoTracks();
              if (!track) return;
              track.enabled = !track.enabled;
              setIsCameraOn(track.enabled);
            }}
            onToggleMic={() => {
              if (!streamRef.current) return;
              const [track] = streamRef.current.getAudioTracks();
              if (!track) return;
              track.enabled = !track.enabled;
              setIsMicOn(track.enabled);
            }}
            permissionError={permissionError}
          />

          <div className="space-y-3">
            {useIntelligentFlow && (
              <ConversationIndicator
                questionType={currentQuestion?.type || "standard"}
                references={questionReferences}
                metadata={questionMetadata}
                interviewerComment={interviewerComment}
                showProgress={true}
                compact={false}
              />
            )}

            <InterviewerPanel
              currentQuestion={
                isLoadingQuestion
                  ? "AI is thinking..."
                  : currentQuestion?.text ||
                    q?.prompt ||
                    "The interviewer is speaking...."
              }
              questionNumber={currentIdx + 1}
              totalQuestions={total}
              interviewer={q?.interviewer || "AI Interviewer"}
              type={currentQuestion?.type || q?.type || "standard"}
              isPlaying={
                isAISpeaking &&
                (currentAudioLabel === "question" ||
                  currentAudioLabel === "interviewer_comment")
              }
              audioUrl={currentQuestion?.audio_url}
            />
          </div>
        </div>

        {showThinkTime && !isAISpeaking && audioQueue.length === 0 && (
          <div className="flex justify-center">
            <ThinkTimeRing timeLeft={thinkTimeLeft} totalTime={3} />
          </div>
        )}

        {awaitingFollowUp && !isAISpeaking && audioQueue.length === 0 && (
          <FollowUpInput
            onSubmit={handleFollowUpSubmit}
            isRecording={isRecording}
            onStartRecording={startRecording}
            onStopRecording={handleFollowUpSubmit}
            transcript={transcript}
            isTranscribing={isTranscribing}
          />
        )}

        {!awaitingFollowUp && (
          <div className="space-y-4">
            {isRecording && <WaveformCanvas analyser={analyserRef.current} />}
            <TranscriptPanel
              transcript={transcript}
              isRecording={isRecording}
              isTranscribing={isTranscribing}
            />
          </div>
        )}

        <ControlBar
          isRecording={isRecording}
          canRepeat={repeatCount < 2}
          canGoNext={
            currentIdx < (plan?.questions?.length || 0) - 1 && !awaitingFollowUp
          }
          onStartThinkTime={() => {
            setShowThinkTime(true);
            setThinkTimeLeft(3);
            const questionText =
              useIntelligentFlow && currentQuestion?.text
                ? currentQuestion.text
                : q?.prompt || "";

            if (currentQuestion?.audio_url && audioEnabled) {
              enqueueAudio([
                { url: currentQuestion.audio_url, label: "question" },
              ]);
            } else {
              speak(questionText);
            }
          }}
          onRepeatQuestion={handleRepeat}
          onNextQuestion={handleNext}
          onEndInterview={handleEndInterview}
          showThinkTime={showThinkTime}
          transcript={transcript}
          isTranscribing={isTranscribing}
          isLoadingQuestion={isLoadingQuestion}
          isAISpeaking={isAISpeaking}
          awaitingFollowUp={awaitingFollowUp}
        />

        {isLoadingQuestion && useIntelligentFlow && !isAISpeaking && (
          <AIThinkingOverlay />
        )}

        {saveStatus && (
          <div
            className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ${
              saveStatus === "saving"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : saveStatus === "saved"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {saveStatus === "saving" && (
              <>
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Saving answer...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Answer saved</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <span className="text-sm font-medium">
                  Save failed (will retry)
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
