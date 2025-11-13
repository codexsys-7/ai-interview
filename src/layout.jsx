// This is the fifth version with breadcrumbs to follow the path trail.

import { useState, useEffect, useRef, useMemo } from "react";
import { Link, NavLink, useLocation, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Breadcrumbs from "./Components/Breadcrumbs.jsx";
import ErrorBoundary from "./Components/ErrorBoundary.jsx"

export default function Layout() {
  const location = useLocation();

  const linkClass = ({ isActive }) =>
    "px-2 py-1 rounded-md text-sm " +
    (isActive ? "text-violet-700 bg-violet-50" : "text-gray-700 hover:text-violet-700");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: brand */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 hidden sm:block">
                Humanoid AI Interview Simulator
              </span>
              <span className="text-xl font-bold text-gray-900 sm:hidden">Humanoid AI</span>
            </Link>

            {/* Right: breadcrumb + links */}
            <div className="flex items-center gap-6">
              {/* breadcrumb */}
              <div className="hidden md:block">
                <Breadcrumbs />
              </div>
              {/* links */}
              <nav className="flex items-center gap-3">
                <NavLink to="/" className={linkClass} end>Home</NavLink>
                <NavLink to="/resume-analysis" className={linkClass}>Resume Analysis</NavLink>
                <NavLink to="/interview" className={linkClass}>Interview</NavLink>
                <NavLink to="/feedback" className={linkClass}>Feedback</NavLink>
                <NavLink to="/complete" className={linkClass}>Complete</NavLink>
              </nav>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-500">
          © 2025 Humanoid AI Interview Simulator • Built for your success
        </div>
      </footer>
    </div>
  );
}




// This is the fourth version..
// Layout.jsx
// import React from "react";
// import { Link, NavLink, useLocation, Outlet } from "react-router-dom";
// import { Sparkles } from "lucide-react";
// import Breadcrumbs from "./Components/Breadcrumbs.jsx";

// export default function Layout() {
//   const location = useLocation();

//   const linkClass = ({ isActive }) =>
//     "px-2 py-1 rounded-md text-sm " +
//     (isActive ? "text-violet-700 bg-violet-50" : "text-gray-700 hover:text-violet-700");

//   return (
//     <div className="min-h-screen bg-gray-50 flex flex-col">
//       <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex justify-between items-center h-16">
//             {/* Left: brand */}
//             <Link to="/" className="flex items-center gap-2 group">
//               <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
//                 <Sparkles className="w-6 h-6 text-white" />
//               </div>
//               <span className="text-xl font-bold text-gray-900 hidden sm:block">
//                 Humanoid AI Interview Simulator
//               </span>
//               <span className="text-xl font-bold text-gray-900 sm:hidden">Humanoid AI</span>
//             </Link>

//             {/* Right: breadcrumb + links */}
//             <div className="flex items-center gap-6">
//               {/* breadcrumb */}
//               <div className="text-sm text-gray-500 hidden md:block">
//                 {/* {location.pathname === "/" && "Home"} */}
//                 {location.pathname === "/resume-analysis" && "Resume Analysis"}
//                 {location.pathname === "/interview" && "Interview Session"}
//                 {location.pathname === "/feedback" && "Feedback & Analysis"}
//                 {location.pathname === "/complete" && "Complete"}
//               </div>

//               {/* links */}
//               <nav className="flex items-center gap-3">
//                 <NavLink to="/" className={linkClass} end>Home</NavLink>
//                 <NavLink to="/resume-analysis" className={linkClass}>Resume Analysis</NavLink>
//                 <NavLink to="/interview" className={linkClass}>Interview</NavLink>
//                 <NavLink to="/feedback" className={linkClass}>Feedback</NavLink>
//                 <NavLink to="/complete" className={linkClass}>Complete</NavLink>
//               </nav>
//             </div>
//           </div>
//         </div>
//       </nav>

//       <main className="flex-1">
//         <Outlet />
//       </main>

//       <footer className="bg-white border-t border-gray-200 mt-auto">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-500">
//           © 2025 Humanoid AI Interview Simulator • Built with ❤️ for your success
//         </div>
//       </footer>
//     </div>
//   );
// }



//This is the third version without breadcrumbs.

// import React from "react";
// import { Link, NavLink, useLocation, Outlet } from "react-router-dom";
// import { Sparkles } from "lucide-react";

// export default function Layout() {
//   const location = useLocation();

//   return (
//     <div className="min-h-screen bg-gray-50 flex flex-col">
//       {/* Top Navigation */}
//       <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex justify-between items-center h-16">
//             <Link to="/" className="flex items-center gap-2 group">
//               <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
//                 <Sparkles className="w-6 h-6 text-white" />
//               </div>
//               <span className="text-xl font-bold text-gray-900 hidden sm:block">
//                 Humanoid AI Interview Simulator
//               </span>
//               <span className="text-xl font-bold text-gray-900 sm:hidden">
//                 Humanoid AI
//               </span>
//             </Link>

//             {/* Breadcrumb */}
//             <div className="text-sm text-gray-500">
//               {location.pathname === "/" && "Home"}
//               {location.pathname === "/Interview" && "Interview Session"}
//               {location.pathname === "/Feedback" && "Feedback & Analysis"}
//               {location.pathname === "/Complete" && "Complete"}
//             </div>
//           </div>
//         </div>
//       </nav>

//       {/* Main Content */}
//       <main className="flex-1">
//         <Outlet /> {/* <-- This is the key change */}
//       </main>

//       {/* Footer */}
//       <footer className="bg-white border-t border-gray-200 mt-auto">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center text-sm text-gray-500">
//           © 2025 Humanoid AI Interview Simulator • Built with ❤️ for your success
//         </div>
//       </footer>
//     </div>
//   );
// }




// This is the second version

// import { Outlet, Link } from "react-router-dom";
// import { Sparkles } from "lucide-react";

// export default function Layout() {
//   return (
//     <div className="min-h-screen bg-gray-50 flex flex-col">
//       <header className="bg-white border-b shadow-sm sticky top-0 z-10">
//         <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
//           <div className="flex items-center gap-2 text-violet-600 font-semibold text-lg">
//             <Sparkles className="w-5 h-5" />
//             <span>Humanoid AI Interview Simulator</span>
//           </div>
//           <nav className="flex items-center gap-6 text-sm text-gray-700">
//             <Link to="/" className="hover:text-violet-600">Home</Link>
//             <Link to="/interview" className="hover:text-violet-600">Interview</Link>
//             <Link to="/feedback" className="hover:text-violet-600">Feedback</Link>
//             <Link to="/complete" className="hover:text-violet-600">Complete</Link>
//           </nav>
//         </div>
//       </header>

//       <main className="flex-1">
//         <Outlet />   {/* ← Home renders here */}
//       </main>

//       <footer className="text-center py-6 text-sm text-gray-500">
//         © 2025 Humanoid AI Interview Simulator • Built with ❤️ for your success
//       </footer>
//     </div>
//   );
// }


// This is my original code.

// import React from "react";
// import { Link, useLocation } from "react-router-dom";
// import { Sparkles } from "lucide-react";

// export default function Layout({ children }) {
//   const location = useLocation();

//   return (
//     <div className="min-h-screen bg-gray-50 flex flex-col">
//       {/* Top Navigation */}
//       <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex justify-between items-center h-16">
//             <Link to="/" className="flex items-center gap-2 group">
//               <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
//                 <Sparkles className="w-6 h-6 text-white" />
//               </div>
//               <span className="text-xl font-bold text-gray-900 hidden sm:block">
//                 Humanoid AI Interview Simulator
//               </span>
//               <span className="text-xl font-bold text-gray-900 sm:hidden">
//                 Humanoid AI
//               </span>
//             </Link>
            
//             {/* Breadcrumb */}
//             <div className="text-sm text-gray-500">
//               {location.pathname === "/" && "Home"}
//               {location.pathname === "/interview" && "Interview Session"}
//               {location.pathname === "/feedback" && "Feedback & Analysis"}
//               {location.pathname === "/complete" && "Complete"}
//             </div>
//           </div>
//         </div>
//       </nav>

//       {/* Main Content */}
//       <main className="flex-1">
//         {children}
//       </main>

//       {/* Footer */}
//       <footer className="bg-white border-t border-gray-200 mt-auto">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
//           <div className="text-center text-sm text-gray-500">
//             © 2025 Humanoid AI Interview Simulator • Built with ❤️ for your success
//           </div>
//         </div>
//       </footer>
//     </div>
//   );
// }