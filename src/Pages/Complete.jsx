import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, TrendingUp, BarChart3, ArrowRight } from "lucide-react";

const MOCK_STATS = {
  totalQuestions: 5,
  avgScore: 4.3,
  improvements: ["Include metrics", "Speak clearly", "Improve time control"]
};

export default function Complete() {
  const navigate = useNavigate();

  const handleStartNew = () => {
    // Clear session storage
    sessionStorage.removeItem("interviewAnswers");
    navigate("/");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
      <div className="max-w-3xl mx-auto">
        {/* Success Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-12 text-center">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full mb-6 shadow-lg">
            <CheckCircle2 className="w-12 h-12 text-white" />
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Interview Complete!
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Great job! Here's a summary of your performance
          </p>

          {/* Stats Grid */}
          <div className="grid sm:grid-cols-2 gap-6 mb-8">
            {/* Total Questions */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-indigo-100">
              <div className="flex items-center justify-center w-12 h-12 bg-indigo-100 rounded-xl mb-3 mx-auto">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {MOCK_STATS.totalQuestions}
              </div>
              <div className="text-sm text-gray-600">Questions Answered</div>
            </div>

            {/* Average Score */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-100">
              <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-xl mb-3 mx-auto">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {MOCK_STATS.avgScore}/5
              </div>
              <div className="text-sm text-gray-600">Average Score</div>
            </div>
          </div>

          {/* Top 3 Improvements */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 text-center">
              Top 3 Improvements
            </h3>
            <ul className="space-y-3">
              {MOCK_STATS.improvements.map((improvement, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full text-sm font-semibold flex-shrink-0 mt-0.5">
                    {index + 1}
                  </div>
                  <span className="text-gray-700">{improvement}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleStartNew}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-xl font-semibold text-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
          >
            Start New Interview
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Additional Info */}
        <div className="text-center mt-8 text-sm text-gray-600">
          Want to improve your score? Review your feedback and try again!
        </div>
      </div>
    </div>
  );
}