import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

export default function Forgot() {
  const { config } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "send the reset email"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h1>Reset password</h1>
      {!config.smtpEnabled ? (
        <div className="alert">Email isn't configured on this server yet, so password reset emails can't be sent. Ask the site admin for help.</div>
      ) : sent ? (
        <div className="alert alert-ok">If an account exists for {email}, a reset link is on its way. Check your inbox, and if it isn't there in a few minutes, look in your spam or junk folder.</div>
      ) : (
        <form onSubmit={submit} className="form">
          <p className="muted">We'll email you a link to choose a new password.</p>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <div className="auth-links">
        <Link to="/login">Back to log in</Link>
      </div>
    </div>
  );
}
