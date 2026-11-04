import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

export function safeNext(params) {
  const next = params.get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function Login() {
  const { user } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").authWithPassword(email.trim(), password);
      navigate(next, { replace: true });
    } catch (err) {
      // PocketBase deliberately doesn't say which part was wrong, so we can't either.
      const badCredentials = err.status === 400 && !Object.keys(err.response?.data || {}).length;
      setError(
        badCredentials
          ? `The email or password is incorrect.\nCheck that “${email.trim()}” is the email you signed up with, and that Caps Lock is off. Forgot your password? Use the link below to reset it. No account yet? Sign up below.`
          : errorMessage(err, "log you in")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h1>Welcome back</h1>
      <p className="muted">Log in to manage your lists and reserve gifts.</p>
      <form onSubmit={submit} className="form">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <div className="auth-links">
        <Link to="/forgot">Forgot password?</Link>
        <span>
          New here? <Link to={`/register${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
        </span>
      </div>
    </div>
  );
}
