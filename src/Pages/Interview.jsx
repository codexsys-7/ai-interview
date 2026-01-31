// This is the final version working on MVP..

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Target,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
  Award,
} from "lucide-react";
import ChipList from "../Components/Upload/Chiplist.jsx";
import UserCameraPanel from "../Components/Interview/UserCameraPanel.jsx";
import InterviewerPanel from "../Components/Interview/InterviewerPanel.jsx";
import WaveformCanvas from "../Components/Interview/WaveFormCanvas.jsx";
import TranscriptPanel from "../Components/Interview/TranscriptPanel.jsx";
import ControlBar from "../Components/Interview/ControlBar.jsx";
import ThinkTimeRing from "../Components/Interview/ThinkTimeRing.jsx";

const PLAN_KEY = "interviewPlan";
const RESULTS_KEY = "interviewResults";

function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-gray-600 text-sm">Preparing your interview…</p>
    </div>
  );
}

export default function Interview() {
  const navigate = useNavigate();

  // ----- Interview plan + pointer -----
  const [plan, setPlan] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loadError, setLoadError] = useState("");

  // ----- Recording + STT -----
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);

  // ----- Per-question UX -----
  const [showThinkTime, setShowThinkTime] = useState(false);
  const [thinkTimeLeft, setThinkTimeLeft] = useState(3);
  const [repeatCount, setRepeatCount] = useState(0);

  // ----- Devices -----
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [stream, setStream] = useState(null);
  const [permissionError, setPermissionError] = useState(null);

  // ----- Audio graph for waveform -----
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);

  // ----- MediaRecorder + buffers -----
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  // ----- Timers + recognizer -----
  const thinkTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptBufferRef = useRef("");

  // ----- Results we'll save for feedback -----
  const [answers, setAnswers] = useState([]);

  // What to do after transcription finishes: "next" | "end" | null
  const pendingNavRef = useRef(null);

  // ----- Session & Answer Saving (Phase 1: Two-way communication) -----
  const [sessionId, setSessionId] = useState(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // "saving" | "saved" | "error" | null
  const saveStatusTimeoutRef = useRef(null);
  const recordingStartTimeRef = useRef(null); // Track when recording started for duration

  useEffect(() => {
    document.title = "InterVue Labs > Interview";
  }, []);

  // Cleanup save status timeout on unmount
  useEffect(() => {
    return () => {
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, []);

  // ------------ Load plan from localStorage ------------
  useEffect(() => {
    const rawPlan = localStorage.getItem(PLAN_KEY);

    if (!rawPlan) {
      setLoadError(
        "We don’t have an interview plan yet. Upload your resume, run the resume analysis, then start an interview from there."
      );
      return;
    }

    try {
      const parsed = JSON.parse(rawPlan);
      if (!parsed?.questions || !parsed.questions.length) {
        setLoadError(
          "Your interview plan looks empty. Please generate questions again from the resume analysis page."
        );
        return;
      }
      setPlan(parsed);
    } catch (err) {
      console.error("Failed to parse interview plan:", err);
      setLoadError(
        "We couldn’t read your interview plan. Try generating a fresh set of questions from your resume."
      );
    }
  }, [navigate]);

  const q = useMemo(
    () => (plan && plan.questions ? plan.questions[currentIdx] : null),
    [plan, currentIdx]
  );

  const total = plan?.meta?.questionCount || plan?.questions?.length || 0;

  // ------------ Create interview session when plan loads ------------
  // This creates a session in the database so we can save answers in real-time
  useEffect(() => {
    // Only create session if we have a plan and haven't created one yet
    if (!plan || sessionId || isCreatingSession || loadError) return;

    const createSession = async () => {
      setIsCreatingSession(true);
      try {
        // Extract interviewer names from questions
        const interviewerNames = [
          ...new Set(plan.questions.map((q) => q.interviewer).filter(Boolean)),
        ];

        const response = await fetch(
          "http://127.0.0.1:8000/api/interview/session/create",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: plan.meta?.role || "Candidate",
              difficulty: plan.meta?.difficulty || "Junior",
              question_count: plan.questions.length,
              interviewer_names: interviewerNames,
              plan: plan, // Store the full plan for reference
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to create interview session");
        }

        const data = await response.json();
        setSessionId(data.session_id);
        console.log("Interview session created:", data.session_id);
      } catch (err) {
        console.error("Failed to create interview session:", err);
        // Don't block the interview if session creation fails
        // Answers will still be saved locally and submitted at the end
      } finally {
        setIsCreatingSession(false);
      }
    };

    createSession();
  }, [plan, sessionId, isCreatingSession, loadError]);

  // ------------ Get user media (camera + mic) ------------
  // If there is no plan or we already hit a load error,
  // do NOT touch the camera/mic at all.
  useEffect(() => {
    if (!plan || loadError) return;

    let mounted = true;

    (async () => {
      try {
        console.log("Requesting camera + mic...");
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log("getUserMedia SUCCESS:", mediaStream);

        if (!mounted) return;
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsCameraOn(true);
        setIsMicOn(true);
        setPermissionError(null);

        // waveform graph
        audioContextRef.current = new (window.AudioContext ||
          window.webkitAudioContext)();
        const source =
          audioContextRef.current.createMediaStreamSource(mediaStream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);
      } catch (e) {
        console.error("Media permission error:", e.name, e.message);
        setPermissionError(
          "Please allow camera and microphone permissions, then reload."
        );
      }
    })();

    return () => {
      mounted = false;
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setIsCameraOn(false);
      setIsMicOn(false);
      try {
        audioContextRef.current?.close();
      } catch {}
      audioContextRef.current = null;
      analyserRef.current = null;
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, [plan, loadError]);

  // ------------ Web Speech API for LIVE transcript ------------
  useEffect(() => {
    if (
      !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    ) {
      console.warn(
        "Web Speech API not supported in this browser for live transcript."
      );
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event) => {
      // Build a simple live transcript from interim + final results
      let liveText = "";
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r[0] && r[0].transcript) {
          liveText += r[0].transcript + " ";
        }
      }
      setTranscript(liveText.trim());
    };

    rec.onerror = (e) => {
      console.warn("SpeechRecognition error:", e.error);
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ------------ Text-to-speech for questions ------------
  const voiceReady = async () => {
    if (!("speechSynthesis" in window)) return;
    if (window.speechSynthesis.getVoices().length > 0) return;
    await new Promise((resolve) => {
      const handler = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve();
      };
      window.speechSynthesis.addEventListener("voiceschanged", handler);
    });
  };

  const speak = async (text) => {
    if (!("speechSynthesis" in window) || !text) return;
    await voiceReady();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find((v) =>
      /en-US|en_GB|English/i.test(v.lang || v.name)
    );
    if (en) u.voice = en;
    u.rate = 0.95;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  };

  // --- helper to clean weird STT junk ---
  const cleanTranscript = (raw) => {
    if (!raw) return "";

    let t = raw.trim();
    const lower = t.toLowerCase();

    // phrases we want to ignore completely
    const junkPhrases = [
      "i don't know why",
      "i dont know why",
      "i don't know",
      "i dont know",
    ];

    // if the ENTIRE transcript is one of these, treat it as empty
    if (junkPhrases.includes(lower)) {
      return "";
    }

    // if it's very short and contains "know why", also treat as junk
    if (lower.includes("know why") && t.length < 25) {
      return "";
    }

    return t;
  };

  // ---------- STT recording via MediaRecorder + /api/transcribe ----------
  const startRecording = () => {
    // 1) Do we have a media stream at all?
    const stream = streamRef.current;
    if (!stream) {
      alert(
        "Microphone not ready. Please allow mic access and reload the page."
      );
      console.error("startRecording: streamRef.current is null");
      return;
    }

    // 2) Make sure there is at least one audio track
    const audioTracks = stream.getAudioTracks();
    console.log("startRecording: audioTracks =", audioTracks);

    if (!audioTracks || audioTracks.length === 0) {
      alert(
        "No audio track found. Please check microphone permissions and reload."
      );
      return;
    }

    try {
      // reset buffer & UI for this answer
      recordedChunksRef.current = [];
      setTranscript("");
      setIsTranscribing(false);

      // Track when recording started (for calculating audio duration)
      recordingStartTimeRef.current = Date.now();

      // Create an audio-only stream for MediaRecorder
      const audioOnlyStream = new MediaStream(audioTracks);
      const mr = new MediaRecorder(audioOnlyStream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mr.onstop = async () => {
        setIsTranscribing(true);
        let cleaned = "";

        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: "audio/webm",
          });
          console.log("Recorded blob:", blob);

          if (!blob || blob.size === 0) {
            setTranscript("No audio detected. Please try again.");
            return;
          }

          const form = new FormData();
          form.append("file", blob, `answer-q${currentIdx + 1}.webm`);

          const res = await fetch("http://127.0.0.1:8000/api/transcribe", {
            method: "POST",
            body: form,
          });

          if (!res.ok) {
            throw new Error("STT request failed");
          }

          const data = await res.json();
          cleaned = cleanTranscript(data.transcript || "");
          setTranscript(cleaned);
        } catch (err) {
          console.error("Transcription failed:", err);
          setTranscript(
            "Could not transcribe audio. Please try speaking again."
          );
        } finally {
          setIsTranscribing(false);
        }

        // After transcription finishes, decide where to go
        const action = pendingNavRef.current;
        pendingNavRef.current = null;

        const merged = buildAnswersWithCurrent(cleaned);

        if (action === "next") {
          advanceToNextQuestion(merged);
        } else if (action === "end") {
          finalizeAndExitInterview(merged);
        }
      };

      console.log("MediaRecorder started");
      mr.start();
      setIsRecording(true);
    } catch (e) {
      console.error("MediaRecorder start failed:", e);
      alert(
        "Could not start recording. Please check your microphone permissions and try again."
      );
      setIsRecording(false);
      setIsTranscribing(false);
    }
  };

  const stopRecording = () => {
    // stop media recorder → triggers mr.onstop → sends to /api/transcribe
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {
      console.warn("MediaRecorder stop error:", e);
    }

    setIsRecording(false);

    // stop live Web Speech
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
    }
  };

  // ------------ Save current answer into state ------------
  const buildAnswersWithCurrent = (answerOverride) => {
    if (!q) return answers;
    const userAnswer = (answerOverride ?? transcript ?? "").trim();

    const entry = {
      id: q.id,
      prompt: q.prompt,
      interviewer: q.interviewer,
      type: q.type,
      userAnswer,
      idealAnswer: q.idealAnswer || "",
    };

    const next = [...answers];
    const ix = next.findIndex((a) => a.id === q.id);
    if (ix >= 0) next[ix] = entry;
    else next.push(entry);

    setAnswers(next);
    return next;
  };

  // ------------ Think-time when question changes ------------
  useEffect(() => {
    if (!q) return;
    if (!streamRef.current) {
      // Wait until mic/camera stream is ready
      return;
    }

    setShowThinkTime(true);
    setThinkTimeLeft(3);
    setRepeatCount(0);
    setTranscript("");
    setIsRecording(false);
    setIsTranscribing(false);

    // ensure any previous recognition is stopped
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
  }, [q?.id, stream]);

  useEffect(() => {
    if (!showThinkTime) return;
    if (thinkTimeLeft <= 0) {
      setShowThinkTime(false);
      // now read the question out and start recording
      speak(q?.prompt || "");
      startRecording();
      return;
    }

    thinkTimerRef.current = setTimeout(
      () => setThinkTimeLeft((t) => t - 1),
      1000
    );
    return () => clearTimeout(thinkTimerRef.current);
  }, [showThinkTime, thinkTimeLeft, q?.prompt]);

  // ------------ Repeat question ------------
  const handleRepeat = () => {
    if (!q) return;
    if (repeatCount >= 2) return;
    setRepeatCount((c) => c + 1);
    speak(q.prompt);
  };

  // ------------ When the user Next / End interview, It saves the current answer using the fucntion, buildAnswersWithCurrent ------------

  /**
   * Submit the current answer to the server for real-time persistence.
   * This runs in the background - doesn't block the UI.
   * Shows a subtle indicator of save status.
   */
  const submitAnswerToServer = async (answerEntry) => {
    // If no session was created, skip server submission
    // (answers will still be saved locally and at the end)
    if (!sessionId) {
      console.log("No session ID - skipping server submission");
      return;
    }

    // Clear any pending status timeout
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }

    // Show saving indicator
    setSaveStatus("saving");

    try {
      // Calculate audio duration if we have a start time
      let audioDuration = null;
      if (recordingStartTimeRef.current) {
        audioDuration = (Date.now() - recordingStartTimeRef.current) / 1000;
        recordingStartTimeRef.current = null; // Reset for next question
      }

      const response = await fetch(
        "http://127.0.0.1:8000/api/interview/answer/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            question_id: answerEntry.id,
            question_text: answerEntry.prompt,
            question_intent: answerEntry.type || "general", // Use question type as intent
            role: plan?.meta?.role || "Candidate",
            user_answer: answerEntry.userAnswer,
            transcript_raw: answerEntry.userAnswer, // Same as user_answer for now
            audio_duration_seconds: audioDuration,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to submit answer");
      }

      const data = await response.json();
      console.log("Answer saved to server:", data.answer_id);

      // Show saved indicator briefly
      setSaveStatus("saved");
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus(null);
      }, 2000); // Hide after 2 seconds

    } catch (err) {
      console.error("Failed to submit answer to server:", err);
      // Show error indicator briefly, but don't block the interview
      setSaveStatus("error");
      saveStatusTimeoutRef.current = setTimeout(() => {
        setSaveStatus(null);
      }, 3000); // Hide after 3 seconds
    }
  };

  /**
   * Move to the next question.
   * - Saves the current transcript into answers
   * - Submits answer to server for real-time persistence
   * - Increments currentIdx
   * - Resets transcript + think time state
   */

  const advanceToNextQuestion = (mergedAnswers) => {
    if (!plan || !q) return;

    // Find the current answer entry that was just saved
    const currentAnswer = mergedAnswers.find((a) => a.id === q.id);

    // Submit the answer to server in the background (non-blocking)
    if (currentAnswer) {
      submitAnswerToServer(currentAnswer);
    }

    const totalQuestions = plan.questions.length;

    if (currentIdx + 1 < totalQuestions) {
      setCurrentIdx((i) => i + 1);
      setTranscript("");
      setAnswers(mergedAnswers);

      // Reset think time for the next question
      setShowThinkTime(true);
      setThinkTimeLeft(3);
      setRepeatCount(0);

      try {
        recognitionRef.current?.stop();
      } catch {}
      setIsRecording(false);

      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // If somehow called on last question, just end interview
      finalizeAndExitInterview(mergedAnswers);
    }
  };

  const finalizeAndExitInterview = (mergedAnswers) => {
    // Submit the last answer to server before exiting
    if (q) {
      const lastAnswer = mergedAnswers.find((a) => a.id === q.id);
      if (lastAnswer) {
        submitAnswerToServer(lastAnswer);
      }
    }

    // Hard-stop camera + mic and audio graph
    try {
      if (streamRef.current) {
        streamRef.current.getTracks()?.forEach((t) => t.stop());
      }
    } catch (e) {
      console.warn("Stream cleanup failed on end:", e);
    }

    streamRef.current = null;
    setStream(null);
    setIsCameraOn(false);
    setIsMicOn(false);

    try {
      audioContextRef.current?.close();
    } catch {}
    audioContextRef.current = null;
    analyserRef.current = null;

    if (!plan) {
      navigate("/resume-analysis");
      return;
    }

    // Store only sessionId in localStorage - Feedback page will fetch from database
    // This is the database-only approach: single source of truth
    if (sessionId) {
      localStorage.setItem("interviewSessionId", sessionId);
    }

    // Keep the plan in localStorage for fallback (in case DB fetch fails)
    // But remove the full answers array - they're now in the database
    const payload = {
      meta: { ...plan.meta, sessionId: sessionId },
      // Note: answers are NOT stored here anymore - fetch from database instead
    };
    localStorage.setItem(RESULTS_KEY, JSON.stringify(payload));

    navigate("/feedback");
  };

  const handleNext = () => {
    if (!plan || !q) return;

    // If we are still recording, stop, then move to next after STT
    if (isRecording) {
      pendingNavRef.current = "next";
      stopRecording();
      return;
    }

    // Not recording: just use current transcript
    const merged = buildAnswersWithCurrent();
    advanceToNextQuestion(merged);
  };

  /**
   * End the interview and go to feedback page.
   * - Stops STT
   * - Merges current answer
   * - Saves to localStorage
   * - Navigates to /feedback
   */

  const handleEndInterview = () => {
    if (!plan || !q) {
      navigate("/resume-analysis");
      return;
    }

    // If still recording, stop first, then finish after STT
    if (isRecording) {
      pendingNavRef.current = "end";
      stopRecording();
      return;
    }

    const merged = buildAnswersWithCurrent();
    finalizeAndExitInterview(merged);
  };

  if (loadError) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Can’t start the interview yet
          </h1>
          <p className="text-gray-600 text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-2 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Upload resume & generate questions
          </button>
        </div>
      </div>
    );
  }

  if (!plan || !q) {
    return (
      <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 bg-gray-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] py-6 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top: user & interviewer */}
        <div className="grid lg:grid-cols-2 gap-6">
          <UserCameraPanel
            stream={stream}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            onToggleCamera={() => {
              if (!streamRef.current) return;
              const [track] = streamRef.current.getVideoTracks();
              if (!track) return;
              track.enabled = !track.enabled;
              setIsCameraOn(track.enabled);
            }}
            onToggleMic={() => {
              if (!streamRef.current) return;
              const [track] = streamRef.current.getAudioTracks();
              if (!track) return;
              track.enabled = !track.enabled;
              setIsMicOn(track.enabled);
            }}
            permissionError={permissionError}
          />

          <InterviewerPanel
            currentQuestion={"The interviewer is speaking...."}
            questionNumber={currentIdx + 1}
            totalQuestions={total}
            interviewer={q.interviewer}
            type={q.type}
          />
        </div>

        {/* Think time */}
        {showThinkTime && (
          <div className="flex justify-center">
            <ThinkTimeRing timeLeft={thinkTimeLeft} totalTime={3} />
          </div>
        )}

        {/* Waveform + transcript */}
        <div className="space-y-4">
          {isRecording && <WaveformCanvas analyser={analyserRef.current} />}
          <TranscriptPanel
            transcript={transcript}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
          />
        </div>

        {/* Controls */}
        <ControlBar
          isRecording={isRecording}
          canRepeat={repeatCount < 2}
          // allow Next while not on last question
          canGoNext={currentIdx < (plan?.questions?.length || 0) - 1}
          onStartThinkTime={() => {
            setShowThinkTime(true);
            setThinkTimeLeft(3);
            speak(q.prompt);
          }}
          onRepeatQuestion={handleRepeat}
          onNextQuestion={handleNext}
          onEndInterview={handleEndInterview}
          showThinkTime={showThinkTime}
          transcript={transcript}
          isTranscribing={isTranscribing}
        />

        {/* Save Status Indicator - subtle notification in bottom-right corner */}
        {saveStatus && (
          <div
            className={`fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ${
              saveStatus === "saving"
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : saveStatus === "saved"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {saveStatus === "saving" && (
              <>
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Saving answer...</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Answer saved</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <span className="text-sm font-medium">Save failed (will retry)</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
