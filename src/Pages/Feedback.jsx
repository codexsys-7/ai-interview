import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, TrendingUp, ArrowRight, Download } from "lucide-react";

// These Imports are for the feedback report downloading(PDF)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PLAN_KEY = "interviewPlan";
const RESULTS_KEY = "interviewResults";
const JD_KEY = "jobDescriptionText";
const SESSION_ID_KEY = "interviewSessionId";

export default function Feedback() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const hasScoredRef = useRef(false);

  // Page title
  useEffect(() => {
    document.title = "InterVue Labs > Feedback Report";
  }, []);

  // Load interview data from DATABASE and call scoring backend
  useEffect(() => {
    if (hasScoredRef.current) return; // stops second execution
    hasScoredRef.current = true;

    const fetchAndScore = async () => {
      setIsLoading(true);

      // Get sessionId from localStorage
      const sessionId = localStorage.getItem(SESSION_ID_KEY);
      const rawPlan = localStorage.getItem(PLAN_KEY);
      const rawResults = localStorage.getItem(RESULTS_KEY);
      const jdText = (localStorage.getItem(JD_KEY) || "").trim();

      // Parse stored data for fallback info
      let plan = null;
      let storedMeta = null;
      try {
        if (rawPlan) plan = JSON.parse(rawPlan);
        if (rawResults) storedMeta = JSON.parse(rawResults)?.meta;
      } catch (e) {
        console.error("Failed to parse stored data:", e);
      }

      // No session ID means interview wasn't completed properly
      if (!sessionId) {
        setLoadError(
          "No finished interview found. Upload your resume, generate questions, complete an interview, then come back for your InterVue Labs scorecard."
        );
        setIsLoading(false);
        return;
      }

      try {
        // Step 1: Fetch interview session and answers from database
        const sessionRes = await fetch(
          `http://127.0.0.1:8000/api/interview/session/${sessionId}`
        );

        if (!sessionRes.ok) {
          throw new Error("Failed to fetch interview session");
        }

        const sessionData = await sessionRes.json();

        // Extract data from database response
        const role = sessionData.role || storedMeta?.role || "Candidate";
        const difficulty = sessionData.difficulty || storedMeta?.difficulty || "Junior";
        const dbAnswers = sessionData.answers || [];
        const dbPlan = sessionData.plan || plan;

        // Convert database answers to the format expected by score-interview
        const answers = dbAnswers.map((a) => {
          // Find the matching question from the plan to get idealAnswer
          const matchingQuestion = dbPlan?.questions?.find(
            (q) => q.id === a.question_id
          );

          return {
            id: a.question_id,
            prompt: a.question_text,
            interviewer: matchingQuestion?.interviewer || "Interviewer",
            type: a.question_intent,
            userAnswer: a.user_answer,
            idealAnswer: matchingQuestion?.idealAnswer || "",
          };
        });

        // Require at least one non-empty answer
        const hasRealAnswer = answers.some(
          (a) => (a.userAnswer || "").trim().length > 0
        );

        if (!answers.length || !hasRealAnswer) {
          setLoadError(
            "We couldn't find any recorded answers. Finish at least one question in an interview before asking for feedback."
          );
          setIsLoading(false);
          return;
        }

        // Step 2: Call scoring endpoint
        const scoreRes = await fetch("http://127.0.0.1:8000/api/score-interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role,
            difficulty,
            answers,
            plan: dbPlan,
            jobDescription: jdText.length >= 40 ? jdText : null,
          }),
        });

        if (!scoreRes.ok) throw new Error("Failed to score interview");

        const data = await scoreRes.json();
        setReport(data);

      } catch (err) {
        console.error("Failed to fetch/score interview:", err);

        // Try to create a fallback report if we have any stored data
        if (plan?.questions?.length) {
          setReport({
            meta: {
              role: storedMeta?.role || "Candidate",
              difficulty: storedMeta?.difficulty || "Junior",
              questionCount: plan.questions.length,
              fallback: true,
            },
            questions: plan.questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              interviewer: q.interviewer,
              type: q.type,
              userAnswer: "Answer not available - database fetch failed",
              idealAnswer: q.idealAnswer || "",
              scores: {
                content: 3,
                structure: 3,
                clarity: 3,
                confidence: 3,
                relevance: 3,
              },
              strengths: [
                "You stayed engaged and tried to answer every question – that already puts you ahead.",
              ],
              improvements: [
                "Use a clear beginning–middle–end (STAR: Situation, Task, Action, Result).",
                "Add 1–2 concrete metrics to show impact.",
              ],
              suggestedAnswer: q.idealAnswer || "",
            })),
            overall: {
              overallScore: 3,
              summary:
                "We couldn't retrieve your full answers from the database. Please try again or start a new interview.",
              strengths: [
                "You completed the interview process.",
              ],
              improvements: [
                "If this error persists, please start a new interview.",
              ],
            },
          });
        } else {
          setLoadError(
            "Failed to retrieve your interview data. Please try again or start a new interview."
          );
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndScore();
  }, [navigate]);

  // Error state: no data / corrupted / no answers
  if (loadError) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <TrendingUp className="w-10 h-10 text-indigo-600 mx-auto" />
          <h1 className="text-xl font-semibold text-gray-900">
            Feedback not ready (yet)
          </h1>
          <p className="text-gray-600 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Start from resume upload
          </button>
        </div>
      </div>
    );
  }

  // Loading spinner
  if (isLoading || !report) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 font-medium">
            InterVue Labs is preparing your personalized feedback report....
          </p>
        </div>
      </div>
    );
  }

  const { meta, questions, overall } = report;

  const handleDownloadPDF = () => {
    if (!report) {
      alert("No feedback report found to download.");
      return;
    }

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const meta = report.meta || {};
    const overall = report.overall || {};
    const questions = Array.isArray(report.questions) ? report.questions : [];

    const title = "InterVue Labs — Interview Feedback Report";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const role = meta.role || "Candidate";
    const difficulty = meta.difficulty || "Junior";
    const qCount = meta.questionCount || questions.length || 0;

    const now = new Date();
    const dateStr = now.toLocaleString();

    doc.text(`Role: ${role}`, 40, 70);
    doc.text(`Difficulty: ${difficulty}`, 40, 88);
    doc.text(`Questions: ${qCount}`, 40, 106);
    doc.text(`Generated: ${dateStr}`, 40, 124);

    // Overall score + summary
    const overallScore = overall.overallScore ?? "N/A";
    const summary = overall.summary || "";

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Overall Score: ${overallScore}/5`, 40, 155);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const wrapSummary = doc.splitTextToSize(
      `Summary: ${summary}`,
      pageWidth - 80
    );
    doc.text(wrapSummary, 40, 175);

    let y = 175 + wrapSummary.length * 14 + 10;

    // Strengths / Improvements lists
    const strengths = Array.isArray(overall.strengths) ? overall.strengths : [];
    const improvements = Array.isArray(overall.improvements)
      ? overall.improvements
      : [];

    if (strengths.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Key Strengths", 40, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      strengths.slice(0, 6).forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, pageWidth - 80);
        doc.text(lines, 40, y);
        y += lines.length * 14;
      });
      y += 8;
    }

    if (improvements.length) {
      doc.setFont("helvetica", "bold");
      doc.text("Top Improvements", 40, y);
      y += 16;
      doc.setFont("helvetica", "normal");
      improvements.slice(0, 6).forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, pageWidth - 80);
        doc.text(lines, 40, y);
        y += lines.length * 14;
      });
      y += 8;
    }

    // Questions table
    const rows = questions.map((q, idx) => {
      const scores = q.scores || {};
      const avg =
        ["content", "structure", "clarity", "confidence", "relevance"]
          .map((k) => Number(scores[k] ?? 0))
          .reduce((a, b) => a + b, 0) / 5;

      const scoreStr = isFinite(avg) && avg > 0 ? avg.toFixed(1) : "N/A";

      const best =
        Array.isArray(q.strengths) && q.strengths.length ? q.strengths[0] : "";
      const improve =
        Array.isArray(q.improvements) && q.improvements.length
          ? q.improvements[0]
          : "";

      return [
        String(idx + 1),
        (q.prompt || "").slice(0, 140),
        q.type || "",
        q.interviewer || "",
        scoreStr,
        (q.userAnswer || "User answer not found").slice(0, 160),
        (best || "").slice(0, 120),
        (improve || "").slice(0, 120),
      ];
    });

    autoTable(doc, {
      startY: Math.min(y + 10, 700),
      head: [
        [
          "#",
          "Question",
          "Type",
          "Interviewer",
          "Avg",
          "User Answer",
          "Strength",
          "Improvement",
        ],
      ],
      body: rows,
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 120 },
        2: { cellWidth: 45 },
        3: { cellWidth: 60 },
        4: { cellWidth: 28 },
        5: { cellWidth: 120 },
        6: { cellWidth: 80 },
        7: { cellWidth: 80 },
      },
    });

    const safeRole = String(role).replace(/[^a-z0-9-_]+/gi, "_");
    const safeDiff = String(difficulty).replace(/[^a-z0-9-_]+/gi, "_");
    doc.save(`InterVueLabs_Feedback_${safeRole}_${safeDiff}.pdf`);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
            <TrendingUp className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Interview Feedback Report
          </h1>
          <p className="text-gray-600">
            Role: <span className="font-semibold">{meta.role}</span> • Level:{" "}
            <span className="font-semibold">{meta.difficulty}</span> •
            Questions:{" "}
            <span className="font-semibold">{meta.questionCount}</span>
          </p>
        </div>

        {/* Overall Summary */}
        <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Overall Performance
              </h2>
              <p className="mt-2 text-gray-600">{overall.summary}</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center">
                <span className="text-3xl font-bold text-indigo-700">
                  {overall.overallScore.toFixed(1)}
                </span>
              </div>
              <span className="mt-2 text-xs text-gray-500">Score out of 5</span>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Your Strengths
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {overall.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">
                Where You Can Grow
              </h3>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {overall.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Per-question feedback */}
        <div className="space-y-4">
          {questions.map((q) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl shadow-md p-5 sm:p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Question {q.id} • {q.type} • {q.interviewer}
                  </p>
                  <p className="mt-1 font-semibold text-gray-900">{q.prompt}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-500 mb-1">
                    Content score
                  </span>
                  <span className="text-lg font-bold text-indigo-700">
                    {q.scores?.content?.toFixed(1) ?? "—"}
                  </span>
                </div>
              </div>

              {/* Answers */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">
                    Your Answer
                  </h4>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 min-h-[72px] whitespace-pre-wrap">
                    {q.userAnswer || "No answer recorded for this question."}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">
                    Suggested Strong Answer
                  </h4>
                  <p className="text-sm text-gray-700 bg-indigo-50/60 rounded-lg p-3 min-h-[72px] whitespace-pre-wrap">
                    {q.suggestedAnswer || q.idealAnswer}
                  </p>
                </div>
              </div>

              {/* Scores + strengths/improvements */}
              <div className="grid md:grid-cols-3 gap-4 text-sm">
                <div>
                  <h5 className="font-semibold text-gray-800 mb-1">
                    Scores (0–5)
                  </h5>
                  <ul className="space-y-0.5 text-gray-700">
                    <li>Content: {q.scores?.content?.toFixed(1) ?? "—"}</li>
                    <li>Structure: {q.scores?.structure?.toFixed(1) ?? "—"}</li>
                    <li>Clarity: {q.scores?.clarity?.toFixed(1) ?? "—"}</li>
                    <li>
                      Confidence: {q.scores?.confidence?.toFixed(1) ?? "—"}
                    </li>
                    <li>Relevance: {q.scores?.relevance?.toFixed(1) ?? "—"}</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-gray-800 mb-1">
                    Your Strengths:
                  </h5>
                  <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
                    {q.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h5 className="font-semibold text-gray-800 mb-1">
                    Growth Opportunities
                  </h5>
                  <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
                    {q.improvements.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom actions */}
        <div className="flex flex-wrap justify-between items-center gap-4 pt-4 border-t border-gray-200">
          <div className="flex gap-3">
            <button
              onClick={handleDownloadPDF}
              disabled={!report || isLoading}
              className={`px-4 py-2 rounded-lg font-medium shadow-sm transition ${
                !report || isLoading
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Download Your Report
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Start a New Interview
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
