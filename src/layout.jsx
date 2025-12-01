// This is the final version for the MVP.

import { useState, useEffect, useRef, useMemo } from "react";
import { Link, NavLink, useLocation, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import ErrorBoundary from "./Components/ErrorBoundary.jsx";
import logo from "./assets/logo.png";

export default function Layout() {
  const location = useLocation();

  const linkClass = ({ isActive }) =>
    "px-2 py-1 rounded-md text-sm " +
    (isActive
      ? "text-violet-700 bg-violet-50"
      : "text-gray-700 hover:text-violet-700");

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: brand */}
            <Link to="/" className="flex items-center gap-2 group">
              <img
                src="src/assets/Logo.png"
                alt="InterVue Labs Logo"
                className="w-10 h-10 rounded-lg shadow-md group-hover:shadow-lg transition-shadow"
              />
              <span className="text-xl font-bold text-gray-900 hidden sm:block">
                InterVue Labs | Humanlike Interview Simulation
              </span>
              <span className="text-xl font-bold text-gray-900 sm:hidden">
                InterVue Labs
              </span>
            </Link>

            {/* Right: breadcrumb + links */}
            <div className="flex items-center gap-6">
              {/* breadcrumb */}
              <div className="hidden md:block"></div>
              {/* links */}
              <nav className="flex items-center gap-3">
                <NavLink to="/" className={linkClass} end>
                  Home
                </NavLink>
                <NavLink to="/resume-analysis" className={linkClass}>
                  Resume Analysis
                </NavLink>
                <NavLink to="/interview" className={linkClass}>
                  Interview
                </NavLink>
                <NavLink to="/feedback" className={linkClass}>
                  Feedback
                </NavLink>
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
          © 2025 InterVue Labs | AI Interview Simulator • Built for your success
        </div>
      </footer>
    </div>
  );
}
