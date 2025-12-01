// This is the Fourth Version using the Actual OPENAI API Key.

import { FileText, Loader2, Upload } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "parsedResumeData";

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
    // Clear any stale analysis so the Resume Analysis link reflects new data
    localStorage.removeItem(STORAGE_KEY);
  };

  const handleProcessResume = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const form = new FormData();
      form.append("file", file);

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

      localStorage.setItem("parsedResumeData", JSON.stringify(data));
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
        <div className="text-center mb-50">
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
              Upload Resume
            </h2>
          </div>

          {/* Upload dropzone */}
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
        </div>
      </div>
    </div>
  );
}
