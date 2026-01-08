// This is my final version of working on MVP.

// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Layout from "./layout";

// Pages
import Home from "./Pages/Home";
import ResumeAnalysis from "./Pages/ResumeAnalysis";
import Interview from "./Pages/Interview";
import Feedback from "./Pages/Feedback";
import Login from "./Pages/Login";
import Signup from "./Pages/Signup";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("authToken");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

//  Gate: decides where "/" should go
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
        {/* Public (NO navbar/footer) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Root entry gate */}
        <Route path="/" element={<AuthGate />} />

        {/* Protected (WITH navbar/footer) */}
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
          <Route path="/feedback" element={<Feedback />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
