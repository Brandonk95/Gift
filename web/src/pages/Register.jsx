import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { safeNext } from "./Login.jsx";

export default function Register() {
  const { user, config, notify } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", passwordConfirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = safeNext(params);

  if (user) return <Navigate to={next} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) return setError(`Your password is only ${form.password.length} characters. It needs to be at least 8.`);
    if (form.password !== form.passwordConfirm) {
      return setError("The password and confirmation don't match. Retype them so they're exactly the same.");
    }
    setBusy(true);
    setError("");
    try {
      const email = form.email.trim();
      await pb.collection("users").create({ ...form, email, name: form.name.trim() });
      await pb.collection("users").authWithPassword(email, form.password);
      if (config.smtpEnabled) {
        pb.collection("users").requestVerification(email).catch(() => {});
        notify("Account created! We emailed you a link to confirm your address. If it isn't in your inbox, check your spam or junk folder.");
      } else {
        notify("Account created! 🎉");
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "create your account"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h1>Create your account</h1>
      <p className="muted">Make wish lists for any occasion and share them with friends.</p>
      <form onSubmit={submit} className="form">
        <label>
          Your name
          <input value={form.name} onChange={set("name")} required maxLength={100} autoFocus placeholder="e.g. Sam" />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={set("password")} required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          Confirm password
          <input type="password" value={form.passwordConfirm} onChange={set("passwordConfirm")} required minLength={8} autoComplete="new-password" />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </button>
      </form>
      <div className="auth-links">
        <span>
          Already have an account? <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link>
        </span>
      </div>
    </div>
  );
}
