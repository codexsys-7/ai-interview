import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthIllustration from "../Components/Auth_Illustration";

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, password }),
      });

      const text = await res.text(); // read raw response safely
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { detail: text };
      }

      if (!res.ok) throw new Error(data?.detail || "Signup failed");

      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      console.error("Signup error:", err);
      alert("Signup failed. Check backend is running and CORS is enabled.");
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
            <h1 className="text-3xl font-bold text-gray-900">Create account</h1>
            <p className="text-sm text-gray-600 mt-2">
              Start your practise by Signing Up.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label className="text-sm text-gray-700">Full Name</label>
                <input
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

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
                {loading ? "Creating..." : "Sign up"}
              </button>

              <p className="text-sm text-gray-600 text-center">
                Already have an account?{" "}
                <Link className="text-blue-700 font-semibold" to="/login">
                  Login
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
