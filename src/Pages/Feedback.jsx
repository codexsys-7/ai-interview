import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import FeedbackItem from "../Components/Feedback/FeedbackItem.jsx";
import ProgressSteps from "../Components/Feedback/ProgressSteps.jsx";

const MOCK_FEEDBACK = [
  {
    questionId: 1,
    question: "Tell me about yourself?",
    yourAnswer: "Mocked transcript here...",
    idealAnswer: "Clear structure: context → actions → metrics → lessons.",
    improvements: [
      "Quantify impact with metrics (e.g., latency ↓30%).",
      "Call out trade-offs and constraints.",
      "Close with lessons learned."
    ],
    scores: { content: 4, clarity: 3, structure: 4 }
  },
  {
    questionId: 2,
    question: "Why did you choose this profession?",
    yourAnswer: "Mocked transcript here...",
    idealAnswer: "Clear structure: context → actions → metrics → lessons.",
    improvements: [
      "Quantify impact with metrics (e.g., latency ↓50%).",
      "Call out trade-offs and constraints.",
      "Close with lessons learned."
    ],
    scores: { content: 4, clarity: 5, structure: 5 }
  },
  {
    questionId: 3,
    question: "Explain Bias-Variance Tradeoff?",
    yourAnswer: "Mocked transcript here...",
    idealAnswer: "Clear structure: context → actions → metrics → lessons.",
    improvements: [
      "Quantify impact with metrics (e.g., latency ↓80%).",
      "Call out trade-offs and constraints.",
      "Close with lessons learned."
    ],
    scores: { content: 3, clarity: 1, structure: 2 }
  },
  {
    questionId: 4,
    question: "How do you handle class imbalance?",
    yourAnswer: "Mocked transcript here...",
    idealAnswer: "Clear structure: context → actions → metrics → lessons.",
    improvements: [
      "Quantify impact with metrics (e.g., latency ↓20%).",
      "Call out trade-offs and constraints.",
      "Close with lessons learned."
    ],
    scores: { content: 3, clarity: 3, structure: 3 }
  },
  {
    questionId: 5,
    question: "Explain the concept of gradient descent in Machine Learning?",
    yourAnswer: "Mocked transcript here...",
    idealAnswer: "Clear structure: context → actions → metrics → lessons.",
    improvements: [
      "Quantify impact with metrics (e.g., latency ↓10%).",
      "Call out trade-offs and constraints.",
      "Close with lessons learned."
    ],
    scores: { content: 5, clarity: 5, structure: 4 }
  }
];

export default function Feedback() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [feedback, setFeedback] = useState(MOCK_FEEDBACK);

  useEffect(() => {
    // Get answers from sessionStorage if available
    const storedAnswers = sessionStorage.getItem("interviewAnswers");
    if (storedAnswers) {
      const answers = JSON.parse(storedAnswers);
      const updatedFeedback = MOCK_FEEDBACK.map((item, index) => ({
        ...item,
        yourAnswer: answers[index] || item.yourAnswer
      }));
      setFeedback(updatedFeedback);
    }
  }, []);

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < feedback.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleEndInterview = () => {
    navigate("/complete");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-8 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            Feedback & Analysis
          </h1>
          <p className="text-gray-600">
            Detailed insights on your interview performance
          </p>
        </div>

        {/* Progress Steps */}
        <ProgressSteps
          totalSteps={feedback.length}
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />

        {/* Feedback Item */}
        <div className="my-8">
          <FeedbackItem feedback={feedback[currentStep]} />
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
          <div className="flex gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 0}
              className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
              Previous
            </button>

            <button
              onClick={handleNext}
              disabled={currentStep === feedback.length - 1}
              className="flex items-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleEndInterview}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-md"
          >
            <Home className="w-5 h-5" />
            End Interview
          </button>
        </div>

        {/* Export Buttons (Disabled) */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            disabled
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
          >
            Download Report (Coming Soon)
          </button>
          <button
            disabled
            className="flex-1 px-6 py-3 bg-gray-100 text-gray-400 rounded-lg font-medium cursor-not-allowed"
          >
            Share (Coming Soon)
          </button>
        </div>
      </div>
    </div>
  );
}