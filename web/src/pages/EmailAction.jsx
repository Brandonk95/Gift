// Landing pages for the links in our auth emails:
// /verify/:token, /reset-password/:token and /confirm-email/:token
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getTokenPayload } from "pocketbase";
import { CheckCircle2, MailWarning } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

function tokenInfo(token) {
  const p = getTokenPayload(token);
  const expired = p.exp ? p.exp * 1000 < Date.now() : false;
  return { ...p, expired };
}

function Result({ ok, title, children }) {
  return (
    <div className="auth-card card email-result">
      <div className={`result-icon ${ok ? "ok" : "bad"}`}>{ok ? <CheckCircle2 size={28} /> : <MailWarning size={28} />}</div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

const SPAM_HINT = "Don't see it within a few minutes? Check your spam or junk folder.";

export function VerifyEmail() {
  const { token } = useParams();
  const { user, config, notify } = useApp();
  const [state, setState] = useState("working");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const info = tokenInfo(token);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode runs effects twice; a token works once
    ran.current = true;
    pb.collection("users")
      .confirmVerification(token)
      .then(async () => {
        if (pb.authStore.isValid) await pb.collection("users").authRefresh().catch(() => {});
        setState("ok");
      })
      .catch((err) => {
        setError(errorMessage(err, "verify your email"));
        setState("failed");
      });
  }, [token]);

  const resend = async () => {
    const email = user?.email || info.email;
    try {
      await pb.collection("users").requestVerification(email);
      setSent(true);
    } catch (err) {
      notify(errorMessage(err, "send a new verification email"), "error");
    }
  };

  if (state === "working") {
    return (
      <Result ok title="Confirming your email…">
        <p className="muted">One moment.</p>
      </Result>
    );
  }

  if (state === "ok") {
    return (
      <Result ok title="Email confirmed 🎉">
        <p className="muted">{info.email ? <strong>{info.email}</strong> : "Your email"} is verified. You'll now get list invitations, reservation reminders and password resets.</p>
        <Link className="btn btn-primary btn-block" to={user ? "/" : "/login"}>
          {user ? "Go to my lists" : "Log in"}
        </Link>
      </Result>
    );
  }

  return (
    <Result title={info.expired ? "This link has expired" : "We couldn't confirm your email"}>
      <p className="muted">
        {info.expired
          ? "Verification links only work for a limited time. Send yourself a fresh one below."
          : user?.verified
            ? "Good news: your email is already verified, so there's nothing left to do."
            : `${error} The link may have already been used, or a newer one was sent.`}
      </p>
      {sent ? (
        <div className="alert alert-ok">
          New link sent to {user?.email || info.email}. {SPAM_HINT}
        </div>
      ) : (
        config.smtpEnabled &&
        !user?.verified &&
        (user?.email || info.email) && (
          <button className="btn btn-primary btn-block" onClick={resend}>
            Send a new verification link
          </button>
        )
      )}
      <div className="auth-links">
        <Link to="/">Back to {config.appName}</Link>
      </div>
    </Result>
  );
}

export function ResetPassword() {
  const { token } = useParams();
  const { user } = useApp();
  const info = tokenInfo(token);
  const [pw, setPw] = useState({ password: "", passwordConfirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw.password.length < 8) return setError(`Your password is only ${pw.password.length} characters. It needs to be at least 8.`);
    if (pw.password !== pw.passwordConfirm) return setError("The password and confirmation don't match. Retype them so they're exactly the same.");
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").confirmPasswordReset(token, pw.password, pw.passwordConfirm);
      // a reset signs out every session, including this one
      if (user) pb.authStore.clear();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "reset your password"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Result ok title="Password changed">
        <p className="muted">You can now log in with your new password. For safety, you've been signed out everywhere else.</p>
        <Link className="btn btn-primary btn-block" to="/login">
          Log in
        </Link>
      </Result>
    );
  }

  if (info.expired) {
    return (
      <Result title="This link has expired">
        <p className="muted">Password reset links only work for a limited time. Request a new one and use it straight away.</p>
        <Link className="btn btn-primary btn-block" to="/forgot">
          Send a new reset link
        </Link>
      </Result>
    );
  }

  return (
    <div className="auth-card card">
      <h1>Choose a new password</h1>
      {info.email && (
        <p className="muted">
          For <strong>{info.email}</strong>
        </p>
      )}
      <form onSubmit={submit} className="form">
        <label>
          New password
          <input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required minLength={8} autoComplete="new-password" autoFocus />
        </label>
        <label>
          Confirm new password
          <input type="password" value={pw.passwordConfirm} onChange={(e) => setPw({ ...pw, passwordConfirm: e.target.value })} required minLength={8} autoComplete="new-password" />
        </label>
        {error && (
          <div className="alert alert-error">
            {error}{" "}
            <Link to="/forgot">Get a new link</Link>
          </div>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </div>
  );
}

export function ConfirmEmail() {
  const { token } = useParams();
  const info = tokenInfo(token);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await pb.collection("users").confirmEmailChange(token, password);
      // the SDK signs you out after an email change; log straight back in with the new address
      if (info.newEmail) await pb.collection("users").authWithPassword(info.newEmail, password).catch(() => {});
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "change your email"));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Result ok title="Email changed">
        <p className="muted">{info.newEmail ? <>From now on, log in with <strong>{info.newEmail}</strong>.</> : "Your new email address is saved."}</p>
        <Link className="btn btn-primary btn-block" to="/">
          Go to my lists
        </Link>
      </Result>
    );
  }

  if (info.expired) {
    return (
      <Result title="This link has expired">
        <p className="muted">Email change links only work for a limited time. Request the change again from your account page.</p>
        <Link className="btn btn-primary btn-block" to="/account">
          Go to my account
        </Link>
      </Result>
    );
  }

  return (
    <div className="auth-card card">
      <h1>Confirm your new email</h1>
      <p className="muted">
        {info.newEmail ? (
          <>
            Enter your password to switch your login email to <strong>{info.newEmail}</strong>.
          </>
        ) : (
          "Enter your password to finish changing your email."
        )}
      </p>
      <form onSubmit={submit} className="form">
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" autoFocus />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Confirming…" : "Confirm new email"}
        </button>
      </form>
    </div>
  );
}
