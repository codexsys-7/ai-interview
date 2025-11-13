import { useRef, useMemo } from "react";
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err, info) { console.error("UI error:", err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[calc(100vh-8rem)] grid place-items-center p-8 text-center">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-gray-700">Something went wrong. Please go back and try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
