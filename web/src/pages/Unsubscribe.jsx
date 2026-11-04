import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage, pb } from "../lib/pb.js";

// /unsubscribe?u=…&k=…&t=…, the link at the bottom of optional emails
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ status: "working" });
  const body = { u: params.get("u"), k: params.get("k"), t: params.get("t") };

  const send = (resubscribe) =>
    pb
      .send("/api/giftlist/unsubscribe", { method: "POST", body: { ...body, resubscribe } })
      .then((r) => setState({ status: r.subscribed ? "resubscribed" : "done", label: r.label }))
      .catch((err) => setState({ status: "error", message: errorMessage(err, "unsubscribe you") }));

  useEffect(() => {
    send(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-card card">
      {state.status === "working" && <p className="muted">Unsubscribing…</p>}
      {state.status === "done" && (
        <>
          <h1>You're unsubscribed</h1>
          <p className="muted">You won't get {state.label} anymore.</p>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => send(true)}>
              Oops, keep sending them
            </button>
            <Link className="btn btn-primary" to="/account#emails">
              All email settings
            </Link>
          </div>
        </>
      )}
      {state.status === "resubscribed" && (
        <>
          <h1>You're subscribed again</h1>
          <p className="muted">You'll keep getting {state.label}.</p>
          <Link className="btn btn-primary btn-block" to="/">
            Go to my lists
          </Link>
        </>
      )}
      {state.status === "error" && (
        <>
          <h1>Couldn't unsubscribe you</h1>
          <p className="muted">{state.message}</p>
          <Link className="btn btn-primary btn-block" to="/account#emails">
            Open email settings
          </Link>
        </>
      )}
    </div>
  );
}
