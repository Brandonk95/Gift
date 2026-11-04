import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Calendar, Users, Wallet } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { countdown, formatDate, formatPrice } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";

// /x/:token, the link in Secret Santa invitations
export default function JoinExchange() {
  const { token } = useParams();
  const { user, config, notify } = useApp();
  const navigate = useNavigate();
  const [x, setX] = useState(null);
  const [error, setError] = useState("");
  const [lists, setLists] = useState([]);
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    pb.send(`/api/giftlist/join/${token}`)
      .then(setX)
      .catch((err) => setError(errorMessage(err, "open this invitation")));
    pb.collection("lists")
      .getFullList({ filter: pb.filter("owner = {:me} && archived = false", { me: user.id }), sort: "-created", fields: "id,title" })
      .then((l) => {
        setLists(l);
        if (l.length === 1) setList(l[0].id);
      })
      .catch(() => {});
  }, [token, user]);

  // you need an account to take part; come back here afterwards
  if (!user) return <Navigate to={`/register?next=${encodeURIComponent(`/x/${token}`)}`} replace />;

  if (error) {
    return (
      <div className="auth-card card">
        <h1>Can't open this invitation</h1>
        <p className="muted">{error}</p>
        <Link className="btn btn-primary btn-block" to="/exchanges">
          Go to Secret Santa
        </Link>
      </div>
    );
  }
  if (!x) return <div className="loading">Loading…</div>;
  if (x.alreadyIn) return <Navigate to={`/exchanges/${x.id}`} replace />;

  const budget = formatPrice(x.budget, x.currency || config.currency);
  const cd = countdown(x.event_date);

  const join = async () => {
    setBusy(true);
    try {
      const r = await pb.send(`/api/giftlist/join/${token}`, { method: "POST", body: { list } });
      notify(`You're in! 🎅 You'll get an email when names are drawn.`);
      navigate(`/exchanges/${r.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err, "join the exchange"));
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card join-card">
      <div className="join-icon">🎅</div>
      <p className="eyebrow">Secret Santa</p>
      <h1>{x.name}</h1>
      <p className="muted">
        <strong>{x.organizer}</strong> invited you to a gift exchange. Everyone draws one name and buys that person a gift, and nobody knows who has whom.
      </p>
      <ul className="join-facts">
        {x.event_date && (
          <li>
            <Calendar size={15} /> {formatDate(x.event_date)}
            {cd && cd !== "Past" && <span className="countdown">{cd}</span>}
          </li>
        )}
        {budget && (
          <li>
            <Wallet size={15} /> About {budget} per gift
          </li>
        )}
        <li>
          <Users size={15} /> {x.joined} {x.joined === 1 ? "person has" : "people have"} joined
        </li>
      </ul>
      {x.message && <p className="santa-note">{x.message}</p>}

      {x.status === "drawn" ? (
        <div className="alert">Names have already been drawn. Ask {x.organizer} to draw again so you're included, then open this link again.</div>
      ) : (
        <div className="form">
          <label>
            Which wish list should your Secret Santa see?
            {lists.length ? (
              <select value={list} onChange={(e) => setList(e.target.value)}>
                <option value="">I'll choose later</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            ) : (
              <span className="muted small">You don't have a wish list yet. Join now and pick one later from the exchange page.</span>
            )}
          </label>
          <button className="btn btn-primary btn-block" onClick={join} disabled={busy}>
            {busy ? "Joining…" : "Join the exchange"}
          </button>
        </div>
      )}
    </div>
  );
}
