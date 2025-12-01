import { useState, useEffect, useRef, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  User,
  Lightbulb,
  Target,
  Award,
} from "lucide-react";

export default function FeedbackItem({ feedback }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getScoreColor = (score) => {
    if (score >= 4) return "bg-green-100 text-green-700 border-green-200";
    if (score >= 3) return "bg-yellow-100 text-yellow-700 border-yellow-200";
    return "bg-red-100 text-red-700 border-red-200";
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
            {feedback.questionId}
          </div>
          <span className="font-semibold text-gray-900 text-left">
            {feedback.question}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-600 flex-shrink-0" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-6 space-y-6">
          {/* Your Response */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <User className="w-5 h-5 text-blue-600" />
              <h4 className="font-semibold text-gray-900">Your Response</h4>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-gray-700">
              {feedback.yourAnswer}
            </div>
          </div>

          {/* Ideal Answer */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-gray-900">
                Recommended Strong Answer....
              </h4>
            </div>
            <div className="bg-green-50 border border-green-100 rounded-lg p-4 text-gray-700">
              {feedback.idealAnswer}
            </div>
          </div>

          {/* What to Improve */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-amber-600" />
              <h4 className="font-semibold text-gray-900">
                Key areas to improve....
              </h4>
            </div>
            <ul className="space-y-2">
              {feedback.improvements.map((improvement, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                  <span className="text-gray-700">{improvement}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Scores */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-gray-900">Scores</h4>
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(feedback.scores).map(([key, value]) => (
                <div
                  key={key}
                  className={`px-4 py-2 rounded-lg border font-medium ${getScoreColor(
                    value
                  )}`}
                >
                  {key.charAt(0).toUpperCase() + key.slice(1)}: {value}/5
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
