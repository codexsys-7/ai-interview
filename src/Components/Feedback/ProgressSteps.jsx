import { useState, useEffect, useRef, useMemo } from "react";
import { Fragment } from "react";
export default function ProgressSteps({ totalSteps, currentStep, onStepClick }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center justify-between">
        {Array.from({ length: totalSteps }, (_, index) => (
          <Fragment key={index}>
            <button
              onClick={() => onStepClick(index)}
              className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full font-bold transition-all ${
                index === currentStep
                  ? "bg-indigo-600 text-white shadow-lg scale-110"
                  : index < currentStep
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-500 hover:bg-gray-300"
              }`}
            >
              {index + 1}
            </button>
            {index < totalSteps - 1 && (
              <div
                className={`flex-1 h-1 mx-2 rounded-full transition-colors ${
                  index < currentStep ? "bg-green-500" : "bg-gray-200"
                }`}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}