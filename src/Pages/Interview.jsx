// This is the Third Version of Interview Page working on Feedback Analysis Page.

import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import UserCameraPanel from "../Components/Interview/UserCameraPanel.jsx";
import InterviewerPanel from "../Components/Interview/InterviewerPanel.jsx";
import WaveformCanvas from "../Components/Interview/WaveFormCanvas.jsx";
import TranscriptPanel from "../Components/Interview/TranscriptPanel.jsx";
import ControlBar from "../Components/Interview/ControlBar.jsx";
import ThinkTimeRing from "../Components/Interview/ThinkTimeRing.jsx";

// localStorage keys used across pages
const PLAN_KEY = "interviewPlan";
const RESULTS_KEY = "interviewResults";

// This will help solve the Loader2 error.
const Spinner = () => (
  <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
);


export default function Interview() {
  const navigate = useNavigate();

  // ----- Interview plan + pointer -----
  const [plan, setPlan] = useState(null); // { meta, questions: [...] }
  const [currentIdx, setCurrentIdx] = useState(0);

  // ----- Recording + STT -----
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  // ----- Per-question UX -----
  const [showThinkTime, setShowThinkTime] = useState(false);
  const [thinkTimeLeft, setThinkTimeLeft] = useState(5);
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

  // ----- Timers + recognizer -----
  const thinkTimerRef = useRef(null);
  const recognitionRef = useRef(null);

  const transcriptBufferRef = useRef("");


  // ----- Results we’ll save for feedback -----
  // { meta, answers: [ {id, topic, interviewer, type, userAnswer, bestAnswer[], improvements[], scores{} } ] }
  const [answers, setAnswers] = useState([]);
  // const [isScoring, setIsScoring] = useState(false);

  // ---------- Load plan + de-duplicate/enrich prompts ----------
  
  useEffect(() => {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) {
      navigate("/resume-analysis");
      return;
    }

    try {
      const parsed = JSON.parse(raw);

      const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
      if (!list.length) {
        navigate("/resume-analysis");
        return;
      }

      // De-duplication & enrichment guard
      const seen = new Set();
      const varied = list.map((qq, i) => {
        let prompt = (qq?.prompt || "").trim();
        if (!prompt || seen.has(prompt)) {
          const topic = qq?.topic || "General";
          const role = parsed?.meta?.role || "Candidate";
          const templates = [
            `As a ${role}, walk me through a recent ${topic} problem you solved. What trade-offs did you make?`,
            `Describe a challenging ${topic} scenario and how you measured impact.`,
            `How would you improve an existing ${topic} solution for scalability and reliability?`,
            `What’s a mistake you learned from in ${topic}, and how did you correct it?`,
            `If you joined tomorrow as ${role}, how would you improve our ${topic} in 90 days?`,
          ];
          prompt = templates[i % templates.length];
        }
        seen.add(prompt);
        return { ...qq, prompt };
      });

      setPlan({ ...parsed, questions: varied });
    } catch (e) {
      console.error("Failed to parse interview plan:", e);
      navigate("/resume-analysis");
    }
  }, [navigate]);




  // Derived
  const total = plan?.meta?.questionCount || plan?.questions?.length || 0;
  const q = useMemo(() => (plan ? plan.questions[currentIdx] : null), [plan, currentIdx]);

  // ---------- Devices on mount ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!mounted) return;
        streamRef.current = mediaStream;
        setStream(mediaStream);
        setIsCameraOn(true);
        setIsMicOn(true);
        setPermissionError(null);

        // waveform graph
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContextRef.current.createMediaStreamSource(mediaStream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        source.connect(analyserRef.current);
      } catch (e) {
        console.error("Media permission error:", e);
        setPermissionError("Please allow camera and microphone permissions, then reload.");
      }
    })();
    return () => {
      mounted = false;
      // cleanup tracks
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
      setIsCameraOn(false);
      setIsMicOn(false);
      // cleanup audio graph
      try { audioContextRef.current?.close(); } catch {}
      audioContextRef.current = null;
      analyserRef.current = null;
      // stop recognizer
      try { recognitionRef.current?.stop(); } catch {}
    };
  }, []);

  // ---------- Toggle tracks ----------
  const toggleCamera = () => {
    const v = streamRef.current?.getVideoTracks()?.[0];
    if (!v) return;
    v.enabled = !v.enabled;
    setIsCameraOn(v.enabled);
  };
  const toggleMic = () => {
    const a = streamRef.current?.getAudioTracks()?.[0];
    if (!a) return;
    a.enabled = !a.enabled;
    setIsMicOn(a.enabled);
  };

  // ---------- Web Speech API (MVP STT) ----------
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    // start with a clean buffer
    transcriptBufferRef.current = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          transcriptBufferRef.current += chunk + " ";
        } else {
          interim += chunk + " ";
        }
      }
      setTranscript((transcriptBufferRef.current + interim).trim());
    };

    rec.onerror = (ev) => {
      if (ev.error !== "no-speech") console.warn("SpeechRecognition error:", ev.error);
    };
    rec.onend = () => setIsRecording(false);

    recognitionRef.current = rec;
    return () => {
      try { rec.stop(); } catch {}
    };
  }, []);


  const startRecording = () => {
    if (!recognitionRef.current) {
      alert("Live speech recognition not supported in this browser. Try Chrome/Edge.");
      return;
    }
    try {
      // ✅ clear buffer + UI for each new answer
      transcriptBufferRef.current = "";
      setTranscript("");

      recognitionRef.current.start();
      setIsRecording(true);
    } catch (e) {
      console.error("rec start failed", e);
    }
  };



  const stopRecording = () => {
    try { recognitionRef.current?.stop(); } catch {}
    setIsRecording(false);
  };

  // ---------- TTS for question ----------
  // ---------- TTS utilities ----------
  const voiceReady = () =>
    new Promise((resolve) => {
      const haveVoices = window.speechSynthesis.getVoices().length > 0;
      if (haveVoices) return resolve();
      const onVoices = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        resolve();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    });

  const speak = async (text) => {
    if (!("speechSynthesis" in window)) return;
    await voiceReady();
    window.speechSynthesis.cancel(); // avoid overlap
    const u = new SpeechSynthesisUtterance(text);
    // pick a stable english voice if available
    const voices = window.speechSynthesis.getVoices();
    const en = voices.find(v => /en-US|en_GB|English/i.test(v.lang || v.name));
    if (en) u.voice = en;
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  };


  // ---------- Save current answer (NO scoring) ----------
  const saveCurrentAnswer = () => {
    if (!q) return;
    const userAnswer = (transcript || "").trim();

    setAnswers((prev) => {
      const next = [...prev];
      const ix = next.findIndex((a) => a.id === q.id);

      const entry = {
        id: q.id,
        prompt: q.prompt,
        interviewer: q.interviewer,
        type: q.type,
        userAnswer,
      };

      if (ix >= 0) next[ix] = entry;
      else next.push(entry);

      return next;
    });
  };

  // Helper to merge the current answer
  const buildAnswersWithCurrent = () => {
    if (!q) return answers;

    const userAnswer = (transcript || "").trim();
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

    // keep state in sync for future (if needed)
    setAnswers(next);
    return next;
  };


  // ---------- Think timer flow ----------
  useEffect(() => {
    if (!q) return;
    // New question → show 10s think time, do NOT speak yet
    setShowThinkTime(true);
    setThinkTimeLeft(5);
    setRepeatCount(0);
    setTranscript("");
    // ensure recording is stopped while thinking
    try { recognitionRef.current?.stop(); } catch {}
    setIsRecording(false);
  }, [q?.id]); // change on new question id

  useEffect(() => {
    if (!showThinkTime) return;
    if (thinkTimeLeft <= 0) {
      setShowThinkTime(false);
      // now speak the question and auto-start recording
      speak(q?.prompt || "");
      startRecording();
      return;
    }
    thinkTimerRef.current = setTimeout(
      () => setThinkTimeLeft((s) => s - 1),
      1000
    );
    return () => clearTimeout(thinkTimerRef.current);
  }, [showThinkTime, thinkTimeLeft, q?.prompt]);


  // ---------- Repeat question (max 2) ----------
  const handleRepeat = () => {
    if (repeatCount >= 2) return;
    setRepeatCount((c) => c + 1);
    speak(q?.prompt || "");
  };

  // ---------- Next question ----------
  const handleNext = () => {
    if (!plan) return;

    // save whatever the user has spoken so far
    saveCurrentAnswer();

    if (currentIdx + 1 < total) {
      setCurrentIdx((i) => i + 1);
      setTranscript("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // last question behaves like end
      handleEnd();
    }
  };


  // ---------- End interview ----------
  const handleEndInterview = () => {
    // stop STT if running
    stopRecording?.();

    if (!plan) {
      navigate("/resume-analysis");
      return;
    }

    // include the current question's answer as well
    const merged = buildAnswersWithCurrent();

    const payload = {
      meta: plan.meta || {},
      answers: merged,
    };

    localStorage.setItem(RESULTS_KEY, JSON.stringify(payload));

    // optionally kill camera/mic immediately (cleanup also runs on unmount)
    try {
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
    } catch (e) {
      console.warn("Stream cleanup failed:", e);
    }

    navigate("/feedback");
  };



  if (!plan || !q) {
    return (
      <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 text-center">
        <Spinner />
        <p className="mt-3 text-gray-600">Preparing your interview…</p>
      </div>
    );
  }
 

  return (
    <div className="min-h-[calc(100vh-8rem)] py-6 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Split: User vs Avatar */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <UserCameraPanel
            stream={stream}
            isCameraOn={isCameraOn}
            isMicOn={isMicOn}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            permissionError={permissionError}
          />

          <InterviewerPanel
            currentQuestion={q.prompt}
            questionNumber={currentIdx + 1}
            totalQuestions={total}
            interviewer={q.interviewer}
            type={q.type}
          />
        </div>

        {/* Think time ring */}
        {showThinkTime && (
          <div className="mb-6">
            <ThinkTimeRing timeLeft={thinkTimeLeft} totalTime={10} />
          </div>
        )}

        {/* Waveform + Transcript */}
        <div className="space-y-6 mb-6">
          {isRecording && <WaveformCanvas analyser={analyserRef.current} />}
          <TranscriptPanel transcript={transcript} isRecording={isRecording} />

          {/* Scoring loader */}
          {/* {isScoring && (
            <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              <span className="text-gray-700 font-medium">
                Scoring your answer…
              </span>
            </div>
          )} */}
        </div>

        {/* Controls */}
      <ControlBar
        isRecording={isRecording}
        canRepeat={repeatCount < 2}
        canGoNext={currentIdx < total - 1}
        onStartThinkTime={() => { setShowThinkTime(true); setThinkTimeLeft(10); speak(q.prompt); }}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onRepeatQuestion={handleRepeat}
        onNextQuestion={handleNext}
        onEndInterview={handleEndInterview}
        showThinkTime={showThinkTime}
        transcript={transcript}
      />
      </div>
    </div>
  );
}



//This is Second Version on Interview Page with Changed Layout, working well and good till here.

// import React, { useState, useEffect, useRef, useMemo } from "react";
// import { useNavigate } from "react-router-dom";
// import UserCameraPanel from "../Components/Interview/UserCameraPanel.jsx";
// import InterviewerPanel from "../Components/Interview/InterviewerPanel.jsx";
// import WaveformCanvas from "../Components/Interview/WaveFormCanvas.jsx";
// import TranscriptPanel from "../Components/Interview/TranscriptPanel.jsx";
// import ControlBar from "../Components/Interview/ControlBar.jsx";
// import ThinkTimeRing from "../Components/Interview/ThinkTimeRing.jsx";

// // localStorage keys used across pages
// const PLAN_KEY = "interviewPlan";
// const RESULTS_KEY = "interviewResults";

// // This will help solve the Loader2 error.
// const Spinner = () => (
//   <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
// );


// export default function Interview() {
//   const navigate = useNavigate();

//   // ----- Interview plan + pointer -----
//   const [plan, setPlan] = useState(null); // { meta, questions: [...] }
//   const [currentIdx, setCurrentIdx] = useState(0);

//   // ----- Recording + STT -----
//   const [isRecording, setIsRecording] = useState(false);
//   const [transcript, setTranscript] = useState("");

//   // ----- Per-question UX -----
//   const [showThinkTime, setShowThinkTime] = useState(false);
//   const [thinkTimeLeft, setThinkTimeLeft] = useState(10);
//   const [repeatCount, setRepeatCount] = useState(0);

//   // ----- Devices -----
//   const [isCameraOn, setIsCameraOn] = useState(false);
//   const [isMicOn, setIsMicOn] = useState(false);
//   const [stream, setStream] = useState(null);
//   const [permissionError, setPermissionError] = useState(null);

//   // ----- Audio graph for waveform -----
//   const audioContextRef = useRef(null);
//   const analyserRef = useRef(null);
//   const streamRef = useRef(null);

//   // ----- Timers + recognizer -----
//   const thinkTimerRef = useRef(null);
//   const recognitionRef = useRef(null);

//   // ----- Results we’ll save for feedback -----
//   // { meta, answers: [ {id, topic, interviewer, type, userAnswer, bestAnswer[], improvements[], scores{} } ] }
//   const [answers, setAnswers] = useState([]);
//   // const [isScoring, setIsScoring] = useState(false);

//   // ---------- Load plan + de-duplicate/enrich prompts ----------
  
//   useEffect(() => {
//     const raw = localStorage.getItem(PLAN_KEY);
//     if (!raw) {
//       navigate("/resume-analysis");
//       return;
//     }

//     try {
//       const parsed = JSON.parse(raw);

//       const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
//       if (!list.length) {
//         navigate("/resume-analysis");
//         return;
//       }

//       // De-duplication & enrichment guard
//       const seen = new Set();
//       const varied = list.map((qq, i) => {
//         let prompt = (qq?.prompt || "").trim();
//         if (!prompt || seen.has(prompt)) {
//           const topic = qq?.topic || "General";
//           const role = parsed?.meta?.role || "Candidate";
//           const templates = [
//             `As a ${role}, walk me through a recent ${topic} problem you solved. What trade-offs did you make?`,
//             `Describe a challenging ${topic} scenario and how you measured impact.`,
//             `How would you improve an existing ${topic} solution for scalability and reliability?`,
//             `What’s a mistake you learned from in ${topic}, and how did you correct it?`,
//             `If you joined tomorrow as ${role}, how would you improve our ${topic} in 90 days?`,
//           ];
//           prompt = templates[i % templates.length];
//         }
//         seen.add(prompt);
//         return { ...qq, prompt };
//       });

//       setPlan({ ...parsed, questions: varied });
//     } catch (e) {
//       console.error("Failed to parse interview plan:", e);
//       navigate("/resume-analysis");
//     }
//   }, [navigate]);




//   // Derived
//   const total = plan?.meta?.questionCount || plan?.questions?.length || 0;
//   const q = useMemo(() => (plan ? plan.questions[currentIdx] : null), [plan, currentIdx]);

//   // ---------- Devices on mount ----------
//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       try {
//         const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//         if (!mounted) return;
//         streamRef.current = mediaStream;
//         setStream(mediaStream);
//         setIsCameraOn(true);
//         setIsMicOn(true);
//         setPermissionError(null);

//         // waveform graph
//         audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
//         const source = audioContextRef.current.createMediaStreamSource(mediaStream);
//         analyserRef.current = audioContextRef.current.createAnalyser();
//         analyserRef.current.fftSize = 2048;
//         source.connect(analyserRef.current);
//       } catch (e) {
//         console.error("Media permission error:", e);
//         setPermissionError("Please allow camera and microphone permissions, then reload.");
//       }
//     })();
//     return () => {
//       mounted = false;
//       // cleanup tracks
//       streamRef.current?.getTracks()?.forEach((t) => t.stop());
//       streamRef.current = null;
//       setStream(null);
//       setIsCameraOn(false);
//       setIsMicOn(false);
//       // cleanup audio graph
//       try { audioContextRef.current?.close(); } catch {}
//       audioContextRef.current = null;
//       analyserRef.current = null;
//       // stop recognizer
//       try { recognitionRef.current?.stop(); } catch {}
//     };
//   }, []);

//   // ---------- Toggle tracks ----------
//   const toggleCamera = () => {
//     const v = streamRef.current?.getVideoTracks()?.[0];
//     if (!v) return;
//     v.enabled = !v.enabled;
//     setIsCameraOn(v.enabled);
//   };
//   const toggleMic = () => {
//     const a = streamRef.current?.getAudioTracks()?.[0];
//     if (!a) return;
//     a.enabled = !a.enabled;
//     setIsMicOn(a.enabled);
//   };

//   // ---------- Web Speech API (MVP STT) ----------
//   useEffect(() => {
//     if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     const rec = new SR();
//     rec.lang = "en-US";
//     rec.interimResults = true;
//     rec.continuous = true;

//     let buffer = "";
//     rec.onresult = (e) => {
//       let interim = "";
//       for (let i = e.resultIndex; i < e.results.length; i++) {
//         const chunk = e.results[i][0].transcript;
//         if (e.results[i].isFinal) buffer += chunk + " ";
//         else interim += chunk + " ";
//       }
//       setTranscript((buffer + interim).trim());
//     };
//     rec.onerror = (ev) => {
//       if (ev.error !== "no-speech") console.warn("SpeechRecognition error:", ev.error);
//     };
//     rec.onend = () => setIsRecording(false);

//     recognitionRef.current = rec;
//     return () => {
//       try { rec.stop(); } catch {}
//     };
//   }, []);

//   const startRecording = () => {
//     if (!recognitionRef.current) {
//       alert("Live speech recognition not supported in this browser. Try Chrome/Edge.");
//       return;
//     }
//     try {
//       setTranscript("");
//       recognitionRef.current.start();
//       setIsRecording(true);
//     } catch (e) {
//       console.error("rec start failed", e);
//     }
//   };


//   const stopRecording = () => {
//     try { recognitionRef.current?.stop(); } catch {}
//     setIsRecording(false);
//   };

//   // ---------- TTS for question ----------
//   // ---------- TTS utilities ----------
//   const voiceReady = () =>
//     new Promise((resolve) => {
//       const haveVoices = window.speechSynthesis.getVoices().length > 0;
//       if (haveVoices) return resolve();
//       const onVoices = () => {
//         window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
//         resolve();
//       };
//       window.speechSynthesis.addEventListener("voiceschanged", onVoices);
//     });

//   const speak = async (text) => {
//     if (!("speechSynthesis" in window)) return;
//     await voiceReady();
//     window.speechSynthesis.cancel(); // avoid overlap
//     const u = new SpeechSynthesisUtterance(text);
//     // pick a stable english voice if available
//     const voices = window.speechSynthesis.getVoices();
//     const en = voices.find(v => /en-US|en_GB|English/i.test(v.lang || v.name));
//     if (en) u.voice = en;
//     u.rate = 0.95;
//     u.pitch = 1;
//     u.volume = 1;
//     window.speechSynthesis.speak(u);
//   };


//   // ---------- Save current answer (NO scoring) ----------
//   const saveCurrentAnswer = () => {
//     if (!q) return;
//     const userAnswer = (transcript || "").trim();

//     setAnswers((prev) => {
//       const next = [...prev];
//       const ix = next.findIndex((a) => a.id === q.id);

//       const entry = {
//         id: q.id,
//         prompt: q.prompt,
//         interviewer: q.interviewer,
//         type: q.type,
//         userAnswer,
//       };

//       if (ix >= 0) next[ix] = entry;
//       else next.push(entry);

//       return next;
//     });
//   };

//   // ---------- Think timer flow ----------
//   useEffect(() => {
//     if (!q) return;
//     // When a new question is shown, speak and start think time
//     setShowThinkTime(true);
//     setThinkTimeLeft(10);
//     setRepeatCount(0);
//     setTranscript("");
//     stopRecording();

//     // Speak question now
//     speak(q.prompt);

//     return () => clearTimeout(thinkTimerRef.current);
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [q?.id]); // change on new question id

//   useEffect(() => {
//     if (!showThinkTime) return;
//     if (thinkTimeLeft <= 0) {
//       setShowThinkTime(false);
//       startRecording(); // auto start after think time
//       return;
//     }
//     thinkTimerRef.current = setTimeout(
//       () => setThinkTimeLeft((s) => s - 1),
//       1000
//     );
//     return () => clearTimeout(thinkTimerRef.current);
//   }, [showThinkTime, thinkTimeLeft]);

//   // ---------- Repeat question (max 2) ----------
//   const handleRepeat = () => {
//     if (repeatCount >= 2) return;
//     setRepeatCount((c) => c + 1);
//     speak(q?.prompt || "");
//   };

//   // ---------- Next question ----------
//   const handleNext = () => {
//     if (!plan) return;

//     // save whatever the user has spoken so far
//     saveCurrentAnswer();

//     if (currentIdx + 1 < total) {
//       setCurrentIdx((i) => i + 1);
//       setTranscript("");
//       window.scrollTo({ top: 0, behavior: "smooth" });
//     } else {
//       // last question behaves like end
//       handleEnd();
//     }
//   };


//   // ---------- End interview ----------
//   const handleEnd = () => {
//     stopRecording();
//     // persist the last answer too
//     saveCurrentAnswer();

//     const payload = { meta: plan.meta, answers };
//     localStorage.setItem("interviewResults", JSON.stringify(payload)); // RESULTS_KEY

//     // also turn off camera/mic (you already have cleanup in unmount, this is just immediate)
//     streamRef.current?.getTracks()?.forEach((t) => t.stop());

//     // go to feedback (or keep user on the page if you want)
//     navigate("/feedback");
//   };


//   if (!plan || !q) {
//     return (
//       <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 text-center">
//         <Spinner />
//         <p className="mt-3 text-gray-600">Preparing your interview…</p>
//       </div>
//     );
//   }
 

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-6 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-gray-50 to-gray-100">
//       <div className="max-w-7xl mx-auto">
//         {/* Split: User vs Avatar */}
//         <div className="grid lg:grid-cols-2 gap-6 mb-6">
//           <UserCameraPanel
//             stream={stream}
//             isCameraOn={isCameraOn}
//             isMicOn={isMicOn}
//             onToggleCamera={toggleCamera}
//             onToggleMic={toggleMic}
//             permissionError={permissionError}
//           />

//           <InterviewerPanel
//             currentQuestion={q.prompt}
//             questionNumber={currentIdx + 1}
//             totalQuestions={total}
//             interviewer={q.interviewer}
//             type={q.type}
//           />
//         </div>

//         {/* Think time ring */}
//         {showThinkTime && (
//           <div className="mb-6">
//             <ThinkTimeRing timeLeft={thinkTimeLeft} totalTime={10} />
//           </div>
//         )}

//         {/* Waveform + Transcript */}
//         <div className="space-y-6 mb-6">
//           {isRecording && <WaveformCanvas analyser={analyserRef.current} />}
//           <TranscriptPanel transcript={transcript} isRecording={isRecording} />
//         </div>

//         {/* Controls */}
//       <ControlBar
//         isRecording={isRecording}
//         canRepeat={repeatCount < 2}
//         canGoNext={currentIdx < total - 1}
//         onStartThinkTime={() => { setShowThinkTime(true); setThinkTimeLeft(10); speak(q.prompt); }}
//         onStartRecording={startRecording}
//         onStopRecording={stopRecording}
//         onRepeatQuestion={handleRepeat}
//         onNextQuestion={handleNext}
//         onEndInterview={handleEnd}
//         showThinkTime={showThinkTime}
//         transcript={transcript}
//       />
//       </div>
//     </div>
//   );
// }




// This is Interview Page First Version.

// import React, { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import QuestionCard from "../Components/Interview/QuestionCard.jsx";
// import VideoMock from "../Components/Interview/VideoMock.jsx";
// import TranscriptBox from "../Components/Interview/TranscriptBox.jsx";

// const MOCK_QUESTIONS = [
//   "Tell me about yourself?",
//   "Why did you choose this profession?",
//   "Explain Bias-Variance Tradeoff?",
//   "How do you handle class imbalance?",
//   "Explain the concept of gradient descent in Machine Learning?"
// ];

// export default function Interview() {
//   const navigate = useNavigate();
//   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
//   const [isRecording, setIsRecording] = useState(false);
//   const [timer, setTimer] = useState(0);
//   const [transcript, setTranscript] = useState("");
//   const [answers, setAnswers] = useState({});

//   useEffect(() => {
//     let interval;
//     if (isRecording) {
//       interval = setInterval(() => {
//         setTimer((prev) => prev + 1);
//       }, 1000);
//     }
//     return () => clearInterval(interval);
//   }, [isRecording]);

//   const handleStartStop = () => {
//     setIsRecording(!isRecording);
//     if (isRecording) {
//       // Simulate transcript
//       setTranscript(transcript + " [Mocked answer continuation...]");
//     }
//   };

//   const handleNextQuestion = () => {
//     // Save current answer
//     setAnswers({
//       ...answers,
//       [currentQuestionIndex]: transcript || "Mocked transcript here..."
//     });

//     if (currentQuestionIndex < MOCK_QUESTIONS.length - 1) {
//       setCurrentQuestionIndex(currentQuestionIndex + 1);
//       setTranscript("");
//       setTimer(0);
//       setIsRecording(false);
//     }
//   };

//   const handleEndInterview = () => {
//     // Save final answer
//     setAnswers({
//       ...answers,
//       [currentQuestionIndex]: transcript || "Mocked transcript here..."
//     });
    
//     // Store answers in sessionStorage for feedback page
//     sessionStorage.setItem("interviewAnswers", JSON.stringify({
//       ...answers,
//       [currentQuestionIndex]: transcript || "Mocked transcript here..."
//     }));
    
//     navigate("/feedback");
//   };

//   const formatTime = (seconds) => {
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
//   };

//   return (
//     <div className="min-h-[calc(100vh-8rem)] py-8 px-4 sm:px-6 lg:px-8 bg-gray-50">
//       <div className="max-w-7xl mx-auto">
//         {/* Split View Layout */}
//         <div className="grid lg:grid-cols-2 gap-6">
//           {/* Left: Questions Panel */}
//           <div className="space-y-6">
//             <QuestionCard
//               question={MOCK_QUESTIONS[currentQuestionIndex]}
//               questionNumber={currentQuestionIndex + 1}
//               totalQuestions={MOCK_QUESTIONS.length}
//               timer={formatTime(timer)}
//               isRecording={isRecording}
//               onStartStop={handleStartStop}
//               onNext={handleNextQuestion}
//               onEnd={handleEndInterview}
//               canGoNext={currentQuestionIndex < MOCK_QUESTIONS.length - 1}
//             />

//             {/* Transcript Box */}
//             <TranscriptBox
//               transcript={transcript}
//               onTranscriptChange={setTranscript}
//               isRecording={isRecording}
//             />
//           </div>

//           {/* Right: Video Panel */}
//           <div className="lg:sticky lg:top-24 h-fit">
//             <VideoMock isRecording={isRecording} />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }