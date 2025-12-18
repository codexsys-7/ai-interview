// This is the Fifth Version: Upload Resume + Optional Job Description (Dual-mode)

import { FileText, Loader2, Upload, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "parsedResumeData";
const JD_KEY = "jobDescriptionText";

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Toggle within the same card space
  const [activeBox, setActiveBox] = useState("resume"); // "resume" | "jd"
  const [jobDesc, setJobDesc] = useState(localStorage.getItem(JD_KEY) || "");

  useEffect(() => {
    document.title = "InterVue Labs > Home";
  }, []);

  useEffect(() => {
    localStorage.removeItem("parsedResumeData");
    localStorage.removeItem("interviewPlan");
    localStorage.removeItem("interviewResults");
  }, []);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleProcessResume = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const jdText = (localStorage.getItem(JD_KEY) || "").trim();
      if (jdText.length >= 40) {
        form.append("job_description", jdText);
      }

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      if (data.error) {
        alert(data.error);
        return;
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      navigate("/resume-analysis");
    } catch (err) {
      console.error(err);
      alert("Failed to parse the resume. Try a text-based PDF or DOCX.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-3">
            InterVue Labs
          </h1>
          <p className="text-sm text-gray-600 max-w-4xl mx-auto">
            Simulate real-world interviews with our intelligent platform |
            Speak, Be Evaluated, Improve, and Get Hired.
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mt-12">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-semibold text-gray-900">
              Resume & Job Description
            </h2>
          </div>

          {/* Toggle buttons (same space) */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setActiveBox("resume")}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeBox === "resume"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Upload Resume
            </button>

            <button
              type="button"
              onClick={() => setActiveBox("jd")}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeBox === "jd"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Job Description
            </button>
          </div>

          {/* One shared space: Resume dropzone OR JD textarea */}
          {activeBox === "resume" ? (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
              <input
                type="file"
                id="resume-upload"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="resume-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <Upload className="w-12 h-12 text-gray-400 mb-4" />
                <span className="text-lg font-medium text-gray-700 mb-2">
                  {file ? file.name : "Choose a file or drag it here"}
                </span>
                <span className="text-sm text-gray-500">
                  PDF, DOC, or DOCX (Max 10MB)
                </span>
              </label>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-semibold text-gray-800">
                  Paste the job description here (optional)
                </span>
              </div>

              <textarea
                value={jobDesc}
                onChange={(e) => {
                  const v = e.target.value;
                  setJobDesc(v);
                  localStorage.setItem(JD_KEY, v);
                }}
                placeholder="Paste the full job description…"
                className="w-full min-h-[220px] p-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="mt-2 text-xs text-gray-500 flex justify-between">
                <span>
                  {jobDesc.trim().length >= 40
                    ? "JD saved ✅ It will be used to compute ATS match."
                    : "Optional — add at least ~2 lines to enable JD match mode."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setJobDesc("");
                    localStorage.removeItem(JD_KEY);
                  }}
                  className="text-red-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Processing state */}
          {isProcessing && (
            <div className="mt-6 flex items-center justify-center gap-3 text-indigo-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">Processing your resume...</span>
            </div>
          )}

          {/* Action button */}
          <button
            onClick={handleProcessResume}
            disabled={!file || isProcessing}
            className={`mt-6 w-full py-3 px-6 rounded-lg font-medium transition-colors shadow-md ${
              !file || isProcessing
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg"
            }`}
          >
            {isProcessing ? "Processing..." : "Process Resume"}
          </button>

          {/* Tiny helper note */}
          <div className="mt-3 text-xs text-gray-500">
            Tip: Upload resume only for general ATS/RARe. Add JD for ATS match +
            JD-driven questions.
          </div>
        </div>
      </div>
    </div>
  );
}
