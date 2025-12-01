// This is my final version of working on MVP.

import { useState, useEffect, useRef, useMemo } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Layout from "./layout.jsx";
import Home from "./Pages/Home.jsx";
import ResumeAnalysis from "./Pages/ResumeAnalysis.jsx";
import Interview from "./Pages/Interview.jsx";
import Feedback from "./Pages/Feedback.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/resume-analysis" element={<ResumeAnalysis />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/feedback" element={<Feedback />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
