import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

const LABEL_OVERRIDES = {
  "resume-analysis": "Resume Analysis",
  interview: "Interview Session",
  feedback: "Feedback & Analysis",
  complete: "Complete",
};

function prettify(segment) {
  const decoded = decodeURI(segment).toLowerCase();
  if (LABEL_OVERRIDES[decoded]) return LABEL_OVERRIDES[decoded];
  return decoded.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean); // e.g. ['resume-analysis']

  // Hide on home
  if (parts.length === 0) {
    return <nav className="text-sm text-gray-500">Home</nav>;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center text-sm font-medium bg-gray-50 px-3 py-1.5 rounded-lg shadow-sm"
    >
      <Link to="/" className="text-blue-600 hover:underline">
        Home
      </Link>
      {parts.map((seg, i) => {
        const href = "/" + parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        const label = prettify(seg);
        return (
          <Fragment key={href}>
            <ChevronRight className="w-4 h-4 text-gray-500 mx-2" />
            {isLast ? (
              <span className="text-gray-800 font-semibold">{label}</span>
            ) : (
              <Link to={href} className="text-blue-600 hover:underline">
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
