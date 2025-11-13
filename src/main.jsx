// This is my third version main.jsx working on Feedback Analysis page.

import { useState, useEffect, useRef, useMemo } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css"
import Layout from "./layout.jsx";
import Home from "./Pages/Home.jsx";
import ResumeAnalysis from "./Pages/ResumeAnalysis.jsx";
import Interview from "./Pages/Interview.jsx";
import Feedback from "./Pages/Feedback.jsx";
import Complete from "./Pages/Complete.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes> 
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/resume-analysis" element={<ResumeAnalysis />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/complete" element={<Complete />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);




// This is my Second Version of main.jsx, until my Interview page is working well and good.

// src/main.jsx (or App.jsx)
// import React, { useState, useEffect, useRef, useMemo } from "react";
// import { StrictMode } from "react";
// import { createRoot } from "react-dom/client";
// import { BrowserRouter, Routes, Route } from "react-router-dom";
// import "./index.css"
// import Layout from "./layout.jsx";
// import Home from "./Pages/Home.jsx";
// import ResumeAnalysis from "./Pages/ResumeAnalysis.jsx";
// import Interview from "./Pages/Interview.jsx";
// import Feedback from "./Pages/Feedback.jsx";
// import Complete from "./Pages/Complete.jsx";

// createRoot(document.getElementById("root")).render(
//   <StrictMode>
//     <BrowserRouter>
//       <Routes>
//         <Route element={<Layout />}>
//           <Route path="/" element={<Home />} />
//           <Route path="/resume-analysis" element={<ResumeAnalysis />} />
//           <Route path="/interview" element={<Interview />} />
//           <Route path="/feedback" element={<Feedback />} />
//           <Route path="/complete" element={<Complete />} />
//         </Route>
//       </Routes>
//     </BrowserRouter>
//   </StrictMode>
// );





// This is my First Version of Main.jsx


// import React from "react";
// import ReactDOM from "react-dom/client";
// import { BrowserRouter, Routes, Route } from "react-router-dom";

// import Layout from "./layout.jsx";
// import Home from "./Pages/Home.jsx";
// import Interview from "./Pages/Interview.jsx";
// import Feedback from "./Pages/Feedback.jsx";
// import Complete from "./Pages/Complete.jsx";
// import ResumeAnalysis from "./Pages/ResumeAnalysis.jsx";
// import "./index.css";


// ReactDOM.createRoot(document.getElementById("root")).render(
//   <React.StrictMode>
//     <BrowserRouter>
//       <Routes>
//         <Route element={<Layout />}>
//           <Route path="/" element={<Home />} />
//           <Route path="/resume-analysis" element={<ResumeAnalysis />} />
//           <Route path="/interview" element={<Interview />} />
//           <Route path="/feedback" element={<Feedback />} />
//           <Route path="/complete" element={<Complete />} />
//         </Route>
//       </Routes>
//     </BrowserRouter>
//   </React.StrictMode>
// );
