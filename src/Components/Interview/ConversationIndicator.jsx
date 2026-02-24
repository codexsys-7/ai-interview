// Phase 1.3: Conversation Indicator Component
// Shows visual feedback that AI is actively remembering and referencing past answers

import React, { useState } from 'react';
import {
  MessageSquare,
  TrendingUp,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Mic,
  Link2,
  CornerDownRight,
  Target,
  Brain
} from 'lucide-react';

// ==================== Question Type Badge ====================
const QuestionTypeBadge = ({ type }) => {
  const badges = {
    standard: {
      icon: '💼',
      label: 'Standard',
      color: 'bg-gray-100 text-gray-700 border-gray-200'
    },
    follow_up: {
      icon: '↪️',
      label: 'Follow-up',
      color: 'bg-blue-100 text-blue-700 border-blue-200'
    },
    challenge: {
      icon: '🤔',
      label: 'Clarification',
      color: 'bg-orange-100 text-orange-700 border-orange-200'
    },
    deep_dive: {
      icon: '🔍',
      label: 'Deep Dive',
      color: 'bg-purple-100 text-purple-700 border-purple-200'
    },
    reference: {
      icon: '🔗',
      label: 'Connected',
      color: 'bg-green-100 text-green-700 border-green-200'
    }
  };

  const badge = badges[type] || badges.standard;

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.color} transition-all duration-200 hover:scale-105`}>
      <span>{badge.icon}</span>
      <span>{badge.label}</span>
    </span>
  );
};

// ==================== Reference Indicator ====================
const ReferenceIndicator = ({ references }) => {
  if (!references?.question_id) return null;

  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded-r-lg mb-4 animate-fade-in">
      <div className="flex items-start gap-2 sm:gap-3">
        <Link2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">
            Connected to Question {references.question_id}
          </p>
          {references.excerpt && (
            <p className="text-sm text-blue-700 mt-1 line-clamp-2">
              Building on your earlier answer: "{references.excerpt}"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== Pattern Detected Indicator ====================
const PatternIndicator = ({ patterns }) => {
  if (!patterns || patterns.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {patterns.slice(0, 3).map((pattern, index) => (
        <div
          key={index}
          className="group relative inline-flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-full px-3 py-1 animate-fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <Sparkles className="w-4 h-4 text-purple-600 animate-pulse-subtle" />
          <span className="text-xs font-medium text-purple-700">
            Pattern detected
          </span>
          <span className="text-xs text-purple-600 hidden sm:inline">
            • {pattern}
          </span>

          {/* Tooltip for mobile */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-10 sm:hidden">
            {pattern}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        </div>
      ))}
    </div>
  );
};

// ==================== Contradiction/Clarification Indicator ====================
const ClarificationIndicator = ({ metadata }) => {
  const hasContradiction = metadata?.action_taken === 'challenge' ||
    metadata?.patterns_detected?.some(p => p.toLowerCase().includes('contradiction'));

  if (!hasContradiction) return null;

  return (
    <div className="bg-orange-50 border-l-4 border-orange-400 p-3 sm:p-4 rounded-r-lg mb-4 animate-shake-subtle">
      <div className="flex items-start gap-2 sm:gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-orange-900">
            Let's clarify something
          </p>
          <p className="text-sm text-orange-700 mt-1">
            Earlier you mentioned one thing, but your recent answer seems different.
            This is a chance to explain the nuance.
          </p>
        </div>
      </div>
    </div>
  );
};

// ==================== Deep Dive Indicator ====================
const DeepDiveIndicator = ({ metadata }) => {
  const isDeepDive = metadata?.action_taken === 'deep_dive';
  const topic = metadata?.topic || metadata?.patterns_detected?.[0]?.split(':')?.[1]?.trim();

  if (!isDeepDive) return null;

  return (
    <div className="bg-indigo-50 border-l-4 border-indigo-500 p-3 sm:p-4 rounded-r-lg mb-4 animate-fade-in">
      <div className="flex items-start gap-2 sm:gap-3">
        <TrendingUp className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-indigo-900">
            {topic ? `Deep diving into ${topic}` : 'Exploring your expertise'}
          </p>
          <p className="text-sm text-indigo-700 mt-1">
            You've shown strong interest in this area - let's explore it further.
          </p>
        </div>
      </div>
    </div>
  );
};

// ==================== Follow-up Indicator ====================
const FollowUpIndicator = ({ questionType, metadata }) => {
  if (questionType !== 'follow_up') return null;

  return (
    <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 animate-fade-in">
      <CornerDownRight className="w-4 h-4 text-blue-600" />
      <span className="text-sm text-blue-700">
        Following up on your last answer
      </span>
      {metadata?.decision_reason && (
        <span className="hidden sm:inline text-xs text-blue-500">
          • {metadata.decision_reason.substring(0, 50)}...
        </span>
      )}
    </div>
  );
};

// ==================== Interviewer Comment Display ====================
const InterviewerComment = ({ comment }) => {
  if (!comment) return null;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded-r-lg mb-4 shadow-sm animate-fade-in">
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">
            Interviewer:
          </p>
          <p className="text-sm sm:text-base text-gray-900 italic leading-relaxed">
            "{comment}"
          </p>
        </div>
      </div>
    </div>
  );
};

// ==================== Conversation Progress Tracker ====================
const ConversationProgress = ({ metadata, isExpanded, onToggle }) => {
  const stage = metadata?.conversation_stage || 'early';
  const topicsCount = metadata?.topics_count || 0;
  const referencesCount = metadata?.references_count || 0;
  const patternsCount = metadata?.patterns_detected?.length || 0;

  // Stage progress mapping
  const stageProgress = {
    early: { width: '33%', color: 'bg-green-500', label: 'Building rapport' },
    mid: { width: '66%', color: 'bg-blue-500', label: 'Deep assessment' },
    late: { width: '100%', color: 'bg-purple-500', label: 'Wrapping up' }
  };

  const currentStage = stageProgress[stage] || stageProgress.early;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4 overflow-hidden transition-all duration-300">
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-indigo-600" />
          <h4 className="text-sm font-semibold text-gray-700">
            Conversation Insights
          </h4>
          {patternsCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-indigo-500 rounded-full">
              {patternsCount}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3 animate-fade-in">
          {/* Stage progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">Interview Stage</span>
              <span className="text-xs font-medium text-gray-900 capitalize">
                {stage} - {currentStage.label}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${currentStage.color} rounded-full transition-all duration-500`}
                style={{ width: currentStage.width }}
              />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-lg sm:text-xl font-bold text-gray-900">{topicsCount}</p>
              <p className="text-xs text-gray-600">Topics</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-lg sm:text-xl font-bold text-gray-900">{referencesCount}</p>
              <p className="text-xs text-gray-600">Connections</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2 text-center">
              <p className="text-lg sm:text-xl font-bold text-gray-900">{patternsCount}</p>
              <p className="text-xs text-gray-600">Patterns</p>
            </div>
          </div>

          {/* Decision reason if available */}
          {metadata?.decision_reason && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
              <span className="font-medium">AI reasoning: </span>
              {metadata.decision_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== Main ConversationIndicator Component ====================
const ConversationIndicator = ({
  questionType = 'standard',
  references = null,
  metadata = null,
  interviewerComment = null,
  showProgress = true,
  compact = false
}) => {
  const [isProgressExpanded, setIsProgressExpanded] = useState(false);

  // Don't render anything if no meaningful data
  const hasIndicators = questionType !== 'standard' ||
    references?.question_id ||
    metadata?.patterns_detected?.length > 0 ||
    interviewerComment;

  if (!hasIndicators && !showProgress) return null;

  return (
    <div className={`conversation-indicator ${compact ? 'space-y-2' : 'space-y-3'}`}>
      {/* Question Type Badge - Always show if not standard */}
      {questionType && questionType !== 'standard' && (
        <div className="flex items-center gap-2 mb-2">
          <QuestionTypeBadge type={questionType} />
        </div>
      )}

      {/* Interviewer Comment - Top priority display */}
      <InterviewerComment comment={interviewerComment} />

      {/* Type-specific indicators */}
      {questionType === 'reference' && <ReferenceIndicator references={references} />}
      {questionType === 'challenge' && <ClarificationIndicator metadata={metadata} />}
      {questionType === 'deep_dive' && <DeepDiveIndicator metadata={metadata} />}
      {questionType === 'follow_up' && <FollowUpIndicator questionType={questionType} metadata={metadata} />}

      {/* Reference indicator (can appear with other types too) */}
      {questionType !== 'reference' && references?.question_id && (
        <ReferenceIndicator references={references} />
      )}

      {/* Pattern indicators */}
      {metadata?.patterns_detected && metadata.patterns_detected.length > 0 && (
        <PatternIndicator patterns={metadata.patterns_detected} />
      )}

      {/* Conversation Progress Tracker */}
      {showProgress && metadata && (
        <ConversationProgress
          metadata={metadata}
          isExpanded={isProgressExpanded}
          onToggle={() => setIsProgressExpanded(!isProgressExpanded)}
        />
      )}
    </div>
  );
};

// Export sub-components for individual use
export {
  QuestionTypeBadge,
  ReferenceIndicator,
  PatternIndicator,
  ClarificationIndicator,
  DeepDiveIndicator,
  FollowUpIndicator,
  InterviewerComment,
  ConversationProgress
};

export default ConversationIndicator;
