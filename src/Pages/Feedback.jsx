import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, TrendingUp, ArrowRight, Download } from "lucide-react";

const PLAN_KEY = "interviewPlan";
const RESULTS_KEY = "interviewResults";
const JD_KEY = "jobDescriptionText";

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

  // Load plan + results and call backend
  useEffect(() => {
    if (hasScoredRef.current) return; // stops second execution
    hasScoredRef.current = true;

    const rawPlan = localStorage.getItem(PLAN_KEY);
    const rawResults = localStorage.getItem(RESULTS_KEY);

    // No interview completed
    if (!rawPlan || !rawResults) {
      setLoadError(
        "No finished interview found. Upload your resume, generate questions, complete an interview, then come back for your InterVue Labs scorecard."
      );
      setIsLoading(false);
      return;
    }

    let plan, results;
    // Safely parse JSON
    try {
      plan = JSON.parse(rawPlan);
      results = JSON.parse(rawResults);
    } catch (e) {
      console.error("Failed to parse stored interview data:", e);
      setLoadError(
        "Your saved interview data is corrupted. Please run a fresh interview to get a new feedback report."
      );
      setIsLoading(false);
      return;
    }

    const role = plan?.meta?.role || "Candidate";
    const difficulty = plan?.meta?.difficulty || "Junior";
    const answers = Array.isArray(results.answers) ? results.answers : [];

    const jdText = (localStorage.getItem(JD_KEY) || "").trim();

    // Require at least one non-empty answer
    const hasRealAnswer = answers.some(
      (a) => (a.userAnswer || "").trim().length > 0
    );

    if (!answers.length || !hasRealAnswer) {
      setLoadError(
        "We couldn’t find any recorded answers. Finish at least one question in an interview before asking for feedback."
      );
      setIsLoading(false);
      return;
    }

    // Call backend to score + (optionally) save to DB
    (async () => {
      try {
        setIsLoading(true);

        const res = await fetch("http://127.0.0.1:8000/api/score-interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // 👇 plan is sent as well so backend has full context
          body: JSON.stringify({
            role,
            difficulty,
            answers,
            plan,
            jobDescription: jdText.length >= 40 ? jdText : null,
          }),
        });

        if (!res.ok) throw new Error("Failed to score interview");

        const data = await res.json();
        setReport(data);
      } catch (err) {
        console.error("Scoring API failed, using fallback report:", err);

        // Fallback basic report if API is down or errors out
        setReport({
          meta: {
            role,
            difficulty,
            questionCount: answers.length,
            fallback: true,
          },
          questions: answers.map((a) => ({
            id: a.id,
            prompt: a.prompt,
            interviewer: a.interviewer,
            type: a.type,
            userAnswer: a.userAnswer,
            idealAnswer: a.idealAnswer || "",
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
            suggestedAnswer: a.idealAnswer || "",
          })),
          overall: {
            overallScore: 3,
            summary:
              "Promising baseline. With more structure, clarity, and metrics, you can sound very strong.",
            strengths: [
              "You consistently tried to address each question.",
              "You have relevant experience you can build into strong stories.",
            ],
            improvements: [
              "Practice using STAR structure (Situation, Task, Action, Result).",
              "Add 1–2 numbers (%, $, time saved) to each story.",
              "Slow down and pause between points to sound more confident.",
            ],
          },
        });
      } finally {
        setIsLoading(false);
      }
    })();
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
              type="button"
              onClick={() => {
                alert("Download full report coming soon!");
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download Full Report
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
