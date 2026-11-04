import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ListIcon } from "../components/ListHeader.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

// /share?title&text&url: where the installed app receives links shared from other
// apps (like a store app's Share button) and from the Add-to-GiftMe bookmark on
// computers. Pick a list and the gift editor opens with the link filled in.
export default function Share() {
  const { user } = useApp();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const shared = [params.get("title"), params.get("text"), params.get("url")].filter(Boolean).join(" ").trim();
  // the Add-to-GiftMe button also sends the store page's picture and price
  const image = params.get("image") || "";
  const price = (/^\d+(\.\d+)?$/.exec(String(params.get("price") || "").replace(/[^\d.]/g, "")) || [""])[0];
  const target = (id) => `/lists/${id}?add=${encodeURIComponent(shared)}${/^https?:\/\//i.test(image) ? `&img=${encodeURIComponent(image)}` : ""}${price ? `&price=${price}` : ""}`;

  useEffect(() => {
    if (!user) return;
    pb.collection("lists")
      .getFullList({ filter: pb.filter("owner = {:me} && archived = false", { me: user.id }), sort: "-updated" })
      .then((l) => {
        if (l.length === 1) navigate(target(l[0].id), { replace: true });
        else setLists(l);
      })
      .catch((err) => setError(errorMessage(err, "load your lists")));
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/share?${params}`)}`} replace />;

  return (
    <div className="auth-card card">
      <h1>Add to which list?</h1>
      <p className="muted small share-preview">{shared || "Nothing was shared."}</p>
      {error && <div className="alert alert-error">{error}</div>}
      {lists === null && !error ? (
        <div className="loading">Loading…</div>
      ) : lists?.length === 0 ? (
        <p className="muted">You don't have a list yet. Create one from your dashboard first.</p>
      ) : (
        <div className="pick-list">
          {(lists || []).map((l) => (
            <button key={l.id} className="pick-row" onClick={() => navigate(target(l.id), { replace: true })}>
              <ListIcon list={l} size="sm" />
              <span className="pick-title">{l.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
