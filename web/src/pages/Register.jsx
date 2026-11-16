import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { safeNext } from "./Login.jsx";
import AuthShell, { PasswordInput } from "../components/AuthShell.jsx";
import { Check } from "lucide-react";

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
    <AuthShell
      title="Create your account"
      tagline="Wish lists for birthdays, holidays and everything in between, with the surprise kept safe."
      footer={
        <span>
          Already have an account? <Link to={`/login${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`}>Log in</Link>
        </span>
      }
    >
      <p className="muted auth-sub">Free, and it takes about a minute.</p>
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
          <PasswordInput value={form.password} onChange={set("password")} minLength={8} autoComplete="new-password" />
          <span className={`pw-check ${form.password.length >= 8 ? "ok" : ""}`}>
            <Check size={13} strokeWidth={3} /> At least 8 characters
          </span>
        </label>
        <label>
          Confirm password
          <PasswordInput value={form.passwordConfirm} onChange={set("passwordConfirm")} minLength={8} autoComplete="new-password" />
          {form.passwordConfirm && (
            <span className={`pw-check ${form.passwordConfirm === form.password ? "ok" : "bad"}`}>
              <Check size={13} strokeWidth={3} /> {form.passwordConfirm === form.password ? "Passwords match" : "Doesn't match yet"}
            </span>
          )}
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Creating…" : "Sign up"}
        </button>
      </form>
    </AuthShell>
  );
}
