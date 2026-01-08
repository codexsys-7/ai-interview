import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthIllustration from "../Components/Auth_Illustration";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "Login failed");

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      navigate("/"); //navigating to Home
    } catch (err) {
      console.error("Login error:", err);
      alert("Login failed. Check backend is running and CORS is enabled.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl overflow-hidden border border-blue-100 grid grid-cols-1 md:grid-cols-2 min-h-[620px]">
        <div className="hidden md:block bg-gradient-to-br from-blue-50 to-white">
          <AuthIllustration />
        </div>

        <div className="p-10 flex items-center justify-center">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-bold text-gray-900">Welcome back</h1>
            <p className="text-sm text-gray-600 mt-2">
              Login to continue your interview practice and analytics.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label className="text-sm text-gray-700">Email</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                />
              </div>

              <div>
                <label className="text-sm text-gray-700">Password</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                />
              </div>

              <button
                disabled={loading}
                className={`w-full rounded-xl py-3 font-semibold shadow-md transition ${
                  loading
                    ? "bg-blue-300 text-white cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {loading ? "Signing in..." : "Login"}
              </button>

              <p className="text-sm text-gray-600 text-center">
                Don't have an account?{" "}
                <Link className="text-blue-700 font-semibold" to="/signup">
                  Sign up
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
