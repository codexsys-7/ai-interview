// src/main.jsx
import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./globals.css";
import "./index.css";

import Layout from "./layout";

// Pages
import Home from "./Pages/Home";
import ResumeAnalysis from "./Pages/ResumeAnalysis";
import Interview from "./Pages/Interview";
import Feedback from "./Pages/Feedback";
import PastInterviews from "./Pages/PastInterviews";
import QuickInterview from "./Pages/QuickInterview";
import Login from "./Pages/Login";
import Signup from "./Pages/Signup";

// Heavy page — lazy load so Silero VAD / ONNX never block app startup
const InterviewArena = lazy(() => import("./Pages/Interview_arena"));

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("authToken");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AuthGate() {
  const token = localStorage.getItem("authToken");
  return token ? (
    <Navigate to="/home" replace />
  ) : (
    <Navigate to="/login" replace />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Root entry gate */}
        <Route path="/" element={<AuthGate />} />

        {/* Protected */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/home" element={<Home />} />
          <Route path="/resume-analysis" element={<ResumeAnalysis />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/interview/arena" element={
            <Suspense fallback={<div className="h-screen flex items-center justify-center text-muted-foreground">Loading interview room…</div>}>
              <InterviewArena />
            </Suspense>
          } />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/past-interviews" element={<PastInterviews />} />
          <Route path="/quick-interview" element={<QuickInterview />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
