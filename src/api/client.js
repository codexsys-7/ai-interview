// Central API client — all backend calls go through here

const BASE = ""  // Uses Vite proxy: /api → http://127.0.0.1:8000

function getToken() {
  return localStorage.getItem("authToken")
}

async function apiFetch(path, options = {}) {
  const token = getToken()
  const headers = {
    ...(options.headers || {}),
  }

  // Only set Content-Type for JSON bodies (not FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const err = await res.json()
      detail = err.detail || err.message || detail
    } catch {
      // ignore parse error
    }
    throw new Error(detail)
  }

  return res.json()
}

// ---------- Auth ----------

export async function apiLogin(email, password) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

export async function apiSignup(fullName, email, password) {
  return apiFetch("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName, email, password }),
  })
}

// ---------- Resume ----------

export async function apiParseResume(file) {
  const form = new FormData()
  form.append("file", file)
  return apiFetch("/api/parse-resume", {
    method: "POST",
    body: form,
  })
}

// ---------- Interview Session ----------

export async function apiCreateSession({ role, difficulty, questionCount, interviewerNames = [], plan = null }) {
  return apiFetch("/api/interview/session/create", {
    method: "POST",
    body: JSON.stringify({
      role,
      difficulty,
      question_count: questionCount,
      interviewer_names: interviewerNames,
      plan,
    }),
  })
}

export async function apiStartWithAudio({ sessionId, role, difficulty = "medium", totalQuestions = 10, generateAudio = true }) {
  return apiFetch("/api/interview/start-with-audio", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      role,
      difficulty,
      total_questions: totalQuestions,
      generate_audio: generateAudio,
    }),
  })
}

// ---------- Real-time Interview ----------

export async function apiSubmitAnswerRealtime({
  sessionId,
  questionId,
  questionText,
  questionIntent = "behavioral",
  role,
  userAnswer,
  transcriptRaw,
  audioDurationSeconds,
  difficulty = "medium",
  totalQuestions = 10,
  generateAudio = true,
}) {
  return apiFetch("/api/interview/submit-answer-realtime", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      question_id: questionId,
      question_text: questionText,
      question_intent: questionIntent,
      role,
      user_answer: userAnswer,
      transcript_raw: transcriptRaw || userAnswer,
      audio_duration_seconds: audioDurationSeconds || 0,
      difficulty,
      total_questions: totalQuestions,
      generate_audio: generateAudio,
    }),
  })
}

export async function apiSubmitFollowup({
  sessionId,
  originalQuestionId,
  originalQuestionText,
  originalQuestionIntent = "behavioral",
  followUpAnswer,
  role,
  difficulty = "medium",
  totalQuestions = 10,
  generateAudio = true,
}) {
  return apiFetch("/api/interview/submit-followup", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      original_question_id: originalQuestionId,
      original_question_text: originalQuestionText,
      original_question_intent: originalQuestionIntent,
      follow_up_answer: followUpAnswer,
      role,
      difficulty,
      total_questions: totalQuestions,
      generate_audio: generateAudio,
    }),
  })
}

// ---------- Transcription ----------

export async function apiTranscribe(audioBlob) {
  const form = new FormData()
  form.append("file", audioBlob, "recording.webm")
  return apiFetch("/api/transcribe", {
    method: "POST",
    body: form,
  })
}

// ---------- Scoring ----------

export async function apiScoreInterview({ role, difficulty, answers }) {
  return apiFetch("/api/score-interview", {
    method: "POST",
    body: JSON.stringify({ role, difficulty, answers }),
  })
}
