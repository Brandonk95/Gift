import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Copy, LogOut, UserMinus, UserPlus, Users } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { occasion } from "../lib/format.js";
import Emoji from "./Emoji.jsx";

const inviteUrl = (token) => `${window.location.origin}/o/${token}`;

// List settings → Owners: invite someone to run the list with you, remove them, or leave.
export default function CoOwners({ list, onListChange }) {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOwner = list.owner === user.id;

  const call = async (path, what) => {
    setBusy(true);
    setError("");
    try {
      return await pb.send(`/api/giftlist/lists/${list.id}/co-owner/${path}`, { method: "POST" });
    } catch (err) {
      setError(errorMessage(err, what));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    const r = await call("invite", "make an invite link");
    if (r) setLink(inviteUrl(r.token));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      notify("Invite link copied. Send it to the person you want to own this list with.");
    } catch {
      notify("Couldn't copy. Select the link and copy it yourself.", "error");
    }
  };

  const remove = async () => {
    const leaving = !isOwner;
    const who = list.co_owner_name || "your co-owner";
    const r = await call("remove", leaving ? "leave this list" : "remove them");
    if (!r) return;
    setConfirming(false);
    setLink("");
    if (leaving) {
      notify(`You left “${list.title}”. It's ${list.owner_name || "the owner"}'s list again.`);
      navigate("/", { replace: true });
    } else {
      onListChange?.({ ...list, co_owner: "", co_owner_name: "" });
      if (list.co_owner) notify(`${who} doesn't own this list anymore.`);
    }
  };

  let body;
  if (list.co_owner && isOwner) {
    body = (
      <>
        <p className="co-owner-line">
          <Users size={15} /> <span><strong>{list.co_owner_name || "Someone"}</strong> owns this list with you.</span>
        </p>
        <p className="muted small">They can add and edit gifts, change these settings and answer questions. Like you, they never see who reserved what. Only you can delete the list.</p>
        {confirming ? (
          <div className="co-owner-actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : `Yes, remove ${list.co_owner_name || "them"}`}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
            <UserMinus size={14} /> Remove {list.co_owner_name || "co-owner"}
          </button>
        )}
      </>
    );
  } else if (list.co_owner) {
    body = (
      <>
        <p className="co-owner-line">
          <Users size={15} /> <span>You own this list with <strong>{list.owner_name || "its owner"}</strong>.</span>
        </p>
        <p className="muted small">You can both add and edit gifts and change these settings, and neither of you sees who reserved what. Only {list.owner_name || "they"} can delete the list.</p>
        {confirming ? (
          <div className="co-owner-actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              {busy ? "Leaving…" : "Yes, leave this list"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)}>
              Stay
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
            <LogOut size={14} /> Leave this list
          </button>
        )}
      </>
    );
  } else if (link) {
    body = (
      <>
        <p className="muted small">Send this link to the person you want to own the list with. It works once: whoever opens it first and accepts becomes the co-owner.</p>
        <div className="input-group">
          <input value={link} readOnly onFocus={(e) => e.target.select()} aria-label="Co-owner invite link" />
          <button type="button" className="btn btn-primary" onClick={copy}>
            <Copy size={15} /> Copy
          </button>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={remove} disabled={busy}>
          Cancel invite
        </button>
      </>
    );
  } else {
    body = (
      <>
        <p className="muted small">Making this list with someone, like a partner for a wedding or baby list? Invite them to own it with you. You'll both be able to add gifts, and neither of you will see who reserved what.</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={invite} disabled={busy}>
          <UserPlus size={14} /> {busy ? "Making a link…" : "Invite a co-owner"}
        </button>
      </>
    );
  }

  return (
    <div className="form-section co-owners">
      <h3 className="form-section-title">Owners</h3>
      {body}
      {error && <div className="alert alert-error">{error}</div>}
    </div>
  );
}

// /o/:token: accept an invite to co-own a list
export function JoinCoOwner() {
  const { token } = useParams();
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pb.send(`/api/giftlist/co-owner/${token}`)
      .then(setInfo)
      .catch((err) => setError(errorMessage(err, "open this invite")));
  }, [token, user?.id]);

  if (error) {
    return (
      <div className="auth-card card">
        <h1>Can't open this invite</h1>
        <p className="muted">{error}</p>
        <Link className="btn btn-primary btn-block" to="/">
          Go to your lists
        </Link>
      </div>
    );
  }
  if (!info) return <div className="loading">Loading…</div>;
  if (info.id) return <Navigate to={`/lists/${info.id}`} replace />;

  const accept = async () => {
    setBusy(true);
    try {
      const r = await pb.send(`/api/giftlist/co-owner/${token}`, { method: "POST" });
      notify(`You own “${info.title}” with ${info.owner_name || "them"} now. It's with your lists on the dashboard.`);
      navigate(`/lists/${r.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "accept the invite"));
      setBusy(false);
    }
  };
  const next = encodeURIComponent(`/o/${token}`);

  return (
    <div className="auth-card card join-card">
      <div className="join-icon">
        <Emoji e={info.emoji || occasion(info.occasion).icon} />
      </div>
      <p className="eyebrow">Invite to own a list</p>
      <h1>{info.title}</h1>
      <p className="muted">
        <strong>{info.owner_name || "Someone"}</strong> wants to make this list with you. You'll both be able to add and edit gifts and change its settings.
      </p>
      <p className="muted small">Like {info.owner_name || "them"}, you won't see who reserved what, so gifts stay a surprise for both of you.</p>
      {user ? (
        <button className="btn btn-primary btn-block" onClick={accept} disabled={busy}>
          {busy ? "Joining…" : "Own this list together"}
        </button>
      ) : (
        <div className="form">
          <Link className="btn btn-primary btn-block" to={`/register?next=${next}`}>
            Create an account to accept
          </Link>
          <Link className="btn btn-ghost btn-block" to={`/login?next=${next}`}>
            I already have an account
          </Link>
        </div>
      )}
    </div>
  );
}
