import { Link, useLocation } from "react-router-dom";

export default function Breadcrumbs() {
  const location = useLocation();

  const path = location.pathname; // "/resume-analysis"

  const pageName =
    path === "/"
      ? "Home"
      : path === "/resume-analysis"
      ? "Resume Analysis"
      : path === "/interview"
      ? "Interview"
      : path === "/feedback"
      ? "Feedback"
      : "";

  return (
    <div className="text-sm text-gray-600 mb-6">
      <span className="text-indigo-600 font-semibold">InterVue Labs</span>
      <span className="mx-2">{">"}</span>
      <span className="font-medium text-gray-800">{pageName}</span>
    </div>
  );
}
