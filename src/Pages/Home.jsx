// This is the Fourth Version using the Actual OPENAI API Key.

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, Loader2 } from "lucide-react";
import ChipList from "../Components/Upload/Chiplist.jsx";


// Mocked output of your resume parser (replace with real API later)
const MOCK_RESUME_DATA = {
  skills: ["Python", "SQL", "Pandas", "AWS", "Snowflake"],
  fallbackroles: ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst",],
  
  //RARe Framework
  rare: {
    readability: 4.6,
    applicability: 4.8,
    remarkability: 4.5,
    total: 4.6,
  },

  //ATS Score
  atsScore: 87,

  // ATS Suggestions if ATS < 90
  atsSuggestions: [
    "Add more domain-specific keywords like 'Airflow', 'ETL', or 'Pipeline Orchestration'.",
    "Include measurable impact — e.g., 'Optimized ETL runtime by 30%'.",
    "Keep formatting simple (no tables, headers, or columns).",
    "Match role titles to standard ones used in target job descriptions.",
  ],
};

const STORAGE_KEY = "parsedResumeData";

export default function Home() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            AI Interview Simulator
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your resume to generate ATS insights, keywords, and tailored interview settings
          </p>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <FileText className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-semibold text-gray-900">Upload Resume</h2>
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
            <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <span className="text-lg font-medium text-gray-700 mb-2">
                {file ? file.name : "Choose a file or drag it here"}
              </span>
              <span className="text-sm text-gray-500">PDF, DOC, or DOCX (Max 10MB)</span>
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



//This is the Third Version.

// import React, { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Upload, FileText, Loader2 } from "lucide-react";
// import ChipList from "../Components/Upload/Chiplist.jsx";


// // Mocked output of your resume parser (replace with real API later)
// const MOCK_RESUME_DATA = {
//   skills: ["Python", "SQL", "Pandas", "AWS", "Snowflake"],
//   fallbackroles: ["Data Scientist", "ML Engineer", "Python Developer", "Business Analyst",],
  
//   //RARe Framework
//   rare: {
//     readability: 4.6,
//     applicability: 4.8,
//     remarkability: 4.5,
//     total: 4.6,
//   },

//   //ATS Score
//   atsScore: 87,

//   // ATS Suggestions if ATS < 90
//   atsSuggestions: [
//     "Add more domain-specific keywords like 'Airflow', 'ETL', or 'Pipeline Orchestration'.",
//     "Include measurable impact — e.g., 'Optimized ETL runtime by 30%'.",
//     "Keep formatting simple (no tables, headers, or columns).",
//     "Match role titles to standard ones used in target job descriptions.",
//   ],
// };

// const STORAGE_KEY = "parsedResumeData";

// export default function Home() {
//   const navigate = useNavigate();
//   const [file, setFile] = useState(null);
//   const [isProcessing, setIsProcessing] = useState(false);

//   const handleFileChange = (e) => {
//     const selected = e.target.files?.[0];
//     if (!selected) return;
//     setFile(selected);
//     // Clear any stale analysis so the Resume Analysis link reflects new data
//     localStorage.removeItem(STORAGE_KEY);
//   };

//   const handleProcessResume = () => {
//     if (!file) return; // no file, no processing
//     setIsProcessing(true);

//     // Simulate parsing delay; swap with real API call later
//     setTimeout(() => {
//       // Save parsed data for ResumeAnalysis page to read
//       localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_RESUME_DATA));

//       setIsProcessing(false);
//       navigate("/resume-analysis");
//     }, 1200);
//   };

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8">
//       <div className="max-w-4xl mx-auto">
//         {/* Hero */}
//         <div className="text-center mb-12">
//           <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
//             AI Interview Simulator
//           </h1>
//           <p className="text-lg text-gray-600 max-w-2xl mx-auto">
//             Upload your resume to generate ATS insights, keywords, and tailored interview settings
//           </p>
//         </div>

//         {/* Upload Card */}
//         <div className="bg-white rounded-2xl shadow-lg p-8">
//           <div className="flex items-center gap-3 mb-6">
//             <FileText className="w-6 h-6 text-indigo-600" />
//             <h2 className="text-2xl font-semibold text-gray-900">Upload Resume</h2>
//           </div>

//           {/* Upload dropzone */}
//           <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
//             <input
//               type="file"
//               id="resume-upload"
//               accept=".pdf,.doc,.docx"
//               onChange={handleFileChange}
//               className="hidden"
//             />
//             <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center">
//               <Upload className="w-12 h-12 text-gray-400 mb-4" />
//               <span className="text-lg font-medium text-gray-700 mb-2">
//                 {file ? file.name : "Choose a file or drag it here"}
//               </span>
//               <span className="text-sm text-gray-500">PDF, DOC, or DOCX (Max 10MB)</span>
//             </label>
//           </div>

//           {/* Processing state */}
//           {isProcessing && (
//             <div className="mt-6 flex items-center justify-center gap-3 text-indigo-600">
//               <Loader2 className="w-5 h-5 animate-spin" />
//               <span className="font-medium">Processing your resume...</span>
//             </div>
//           )}

//           {/* Action button */}
//           <button
//             onClick={handleProcessResume}
//             disabled={!file || isProcessing}
//             className={`mt-6 w-full py-3 px-6 rounded-lg font-medium transition-colors shadow-md ${
//               !file || isProcessing
//                 ? "bg-gray-300 text-gray-600 cursor-not-allowed"
//                 : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg"
//             }`}
//           >
//             {isProcessing ? "Processing..." : "Process Resume"}
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }




// This is the First Version.

// src/pages/Home.js
// import { useState } from "react";
// import { Upload, FileText, Loader2 } from "lucide-react";

// export default function Home() {
//   const [file, setFile] = useState(null);
//   const [isProcessing, setIsProcessing] = useState(false);

//   const handleFileChange = (e) => {
//     const f = e.target.files?.[0];
//     if (f) setFile(f);
//   };

//   const handleProcessResume = () => {
//     if (!file) return;
//     setIsProcessing(true);
//     setTimeout(() => setIsProcessing(false), 1200);
//   };

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8">
//       <div className="max-w-4xl mx-auto">
//         {/* Hero */}
//         <div className="text-center mb-12">
//           <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
//             AI Interview Simulator
//           </h1>
//           <p className="text-lg text-gray-600 max-w-2xl mx-auto">
//             Upload your resume and practice your interview skills with AI-powered
//             questions tailored to your experience
//           </p>
//         </div>

//         {/* Upload Card */}
//         <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
//           <div className="flex items-center gap-3 mb-6">
//             <FileText className="w-6 h-6 text-indigo-600" />
//             <h2 className="text-2xl font-semibold text-gray-900">Upload Resume</h2>
//           </div>

//           <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
//             <input
//               type="file"
//               id="resume-upload"
//               accept=".pdf,.docx"
//               onChange={handleFileChange}
//               className="hidden"
//             />
//             <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center">
//               <Upload className="w-12 h-12 text-gray-400 mb-4" />
//               <span className="text-lg font-medium text-gray-700 mb-2">
//                 {file ? file.name : "Choose a file or drag it here"}
//               </span>
//               <span className="text-sm text-gray-500">PDF or DOCX (Max 10MB)</span>
//             </label>
//           </div>

//           {isProcessing && (
//             <div className="mt-6 flex items-center justify-center gap-3 text-indigo-600">
//               <Loader2 className="w-5 h-5 animate-spin" />
//               <span className="font-medium">Processing your resume...</span>
//             </div>
//           )}

//           {file && !isProcessing && (
//             <button
//               onClick={handleProcessResume}
//               className="mt-6 w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg"
//             >
//               Process Resume
//             </button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }



// This is the second version

// import React, { useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Upload, FileText, Loader2, ArrowRight } from "lucide-react";
// import ChipList from "../Components/Upload/Chiplist.jsx";
// const STORAGE_KEY = "parsedResumeData";

// const MOCK_RESUME_DATA = {
//   skills: ["Python", "SQL", "Pandas", "AWS", "Snowflake"],
//   keywords: ["ETL", "Forecasting", "CI/CD", "Docker", "Airflow"],
//   categories: ["Data Scientist", "ML Engineer", "Python Developer"]
// };

// export default function Home() {
//   const navigate = useNavigate();
//   const [file, setFile] = useState(null);
//   const [isProcessing, setIsProcessing] = useState(false);
//   const [parsedData, setParsedData] = useState(null);

//   const handleFileChange = (e) => {
//     const selectedFile = e.target.files[0];
//     if (selectedFile) {
//       setFile(selectedFile);
//       setParsedData(null);
//     }
//   };

//   const handleProcessResume = () => {
//     if (!file) return; // no file selected? do nothing

//     setIsProcessing(true); // show spinner

//     // simulate "AI processing" delay
//     setTimeout(() => {
//       // 1️⃣ save the fake parsed data into browser storage
//       localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_RESUME_DATA));

//       // 2️⃣ stop the spinner
//       setIsProcessing(false);

//       // 3️⃣ move user to Resume Analysis page
//       navigate("/Resume-Analysis");
//     }, 2000);
//   };

//   const handleStartInterview = () => {
//     navigate("/interview");
//   };

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8">
//       <div className="max-w-4xl mx-auto">
//         {/* Hero Section */}
//         <div className="text-center mb-12">
//           <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
//             AI Interview Simulator
//           </h1>
//           <p className="text-lg text-gray-600 max-w-2xl mx-auto">
//             Upload your resume and practice your interview skills with AI-powered questions 
//             tailored to your experience
//           </p>
//         </div>

//         {/* Upload Card */}
//         <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
//           <div className="flex items-center gap-3 mb-6">
//             <FileText className="w-6 h-6 text-indigo-600" />
//             <h2 className="text-2xl font-semibold text-gray-900">Upload Resume</h2>
//           </div>

//           {/* File Upload Widget */}
//           <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
//             <input
//               type="file"
//               id="resume-upload"
//               accept=".pdf,.docx"
//               onChange={handleFileChange}
//               className="hidden"
//             />
//             <label
//               htmlFor="resume-upload"
//               className="cursor-pointer flex flex-col items-center"
//             >
//               <Upload className="w-12 h-12 text-gray-400 mb-4" />
//               <span className="text-lg font-medium text-gray-700 mb-2">
//                 {file ? file.name : "Choose a file or drag it here"}
//               </span>
//               <span className="text-sm text-gray-500">
//                 PDF or DOCX (Max 10MB)
//               </span>
//             </label>
//           </div>

//           {/* Processing Progress */}
//           {isProcessing && (
//             <div className="mt-6 flex items-center justify-center gap-3 text-indigo-600">
//               <Loader2 className="w-5 h-5 animate-spin" />
//               <span className="font-medium">Processing your resume...</span>
//             </div>
//           )}

//           {/* Process Button */}
//           {file && !parsedData && !isProcessing && (
//             <button
//               onClick={handleProcessResume}
//               className="mt-6 w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg"
//             >
//               Process Resume
//             </button>
//           )}
//         </div>

//         {/* Parsed Results */}
//         {parsedData && (
//           <div className="space-y-6 animate-fadeIn">
//             {/* Skills Card */}
//             <div className="bg-white rounded-2xl shadow-lg p-6">
//               <h3 className="text-lg font-semibold text-gray-900 mb-4">
//                 Skills Detected
//               </h3>
//               <ChipList items={parsedData.skills} color="blue" />
//             </div>

//             {/* Keywords Card */}
//             <div className="bg-white rounded-2xl shadow-lg p-6">
//               <h3 className="text-lg font-semibold text-gray-900 mb-4">
//                 Top Keywords
//               </h3>
//               <ChipList items={parsedData.keywords} color="purple" />
//             </div>

//             {/* Categories Card */}
//             <div className="bg-white rounded-2xl shadow-lg p-6">
//               <h3 className="text-lg font-semibold text-gray-900 mb-4">
//                 Job Categories
//               </h3>
//               <ChipList items={parsedData.categories} color="green" />
//             </div>

//             {/* Start Interview CTA */}
//             <button
//               onClick={handleStartInterview}
//               className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
//             >
//               Start Interview
//               <ArrowRight className="w-5 h-5" />
//             </button>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }



