import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import Modal from "./Modal.jsx";
import { errorMessage, pb } from "../lib/pb.js";

// Reserve (or chip in) without making an account: name + email, then a 6-digit
// code from the email signs you in, and `onSignedIn(userId)` carries on.
export default function GuestReserve({ item, chip = false, ownerName, loginPath, onSignedIn, onClose }) {
  const [step, setStep] = useState("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpId, setOtpId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pb.send("/api/giftlist/guest", { method: "POST", body: { name: name.trim(), email: email.trim() } });
      const res = await pb.collection("users").requestOTP(email.trim());
      setOtpId(res.otpId);
      setCode("");
      setStep("code");
    } catch (err) {
      setError(errorMessage(err, "send your code"));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const auth = await pb.collection("users").authWithOTP(otpId, code.replace(/\D/g, ""));
      await onSignedIn(auth.record.id);
      onClose();
    } catch (err) {
      setError(
        err.status === 400
          ? "That code didn't work. Check you typed the newest one (codes expire after 10 minutes), or send a new code."
          : errorMessage(err, "check your code")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={!item ? "Sign in with your email" : chip ? `Chip in on “${item.name}”` : `Reserve “${item.name}”`} onClose={onClose}>
      {step === "email" ? (
        <form className="form" onSubmit={sendCode}>
          <p className="muted small">
            No password or app needed. We'll email you a 6-digit code to confirm it's you. {ownerName} won't see who {chip ? "chipped in" : "reserved what"}.
          </p>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus autoComplete="name" placeholder="So you know which gifts are yours" />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            <Mail size={15} /> {busy ? "Sending…" : "Email me a code"}
          </button>
          <p className="muted small center">
            Have a password? <Link to={loginPath}>Log in</Link>
          </p>
        </form>
      ) : (
        <form className="form" onSubmit={verify}>
          <p className="muted small">
            We sent a code to <strong>{email.trim()}</strong>. It can take a minute; check your spam folder if you don't see it.
          </p>
          <label>
            6-digit code
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              placeholder="123456"
            />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="btn btn-primary btn-block" disabled={busy || code.replace(/\D/g, "").length < 6}>
            {busy ? "Checking…" : !item ? "Confirm" : chip ? "Confirm and continue" : "Confirm and reserve"}
          </button>
          <div className="auth-links">
            <button type="button" className="link-btn" disabled={busy} onClick={() => setStep("email")}>
              Use a different email
            </button>
            <button type="button" className="link-btn" disabled={busy} onClick={sendCode}>
              Send a new code
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
