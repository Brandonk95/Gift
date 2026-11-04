import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import Modal from "../components/Modal.jsx";
import { LoadError } from "./NotFound.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { countdown, dateOnly, formatDate, formatPrice } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";

// Secret Santa: the exchanges you organize or are part of.
export default function Exchanges() {
  const [exchanges, setExchanges] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    pb.send("/api/giftlist/exchanges")
      .then((d) => alive && setExchanges(d))
      .catch((err) => alive && setError(errorMessage(err, "load your gift exchanges")));
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  if (error) return <LoadError message={error} onRetry={() => (setError(""), setReloadKey((k) => k + 1))} />;
  if (!exchanges) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Secret Santa 🎅</h1>
          <p className="muted">Draw names with family or friends. Everyone gets one person to shop for, and nobody knows who has whom.</p>
        </div>
        {exchanges.length > 0 && (
          <button className="btn btn-primary" onClick={() => setForm(true)}>
            <Plus size={16} /> New exchange
          </button>
        )}
      </div>

      {exchanges.length === 0 ? (
        <div className="empty santa-empty">
          <div className="empty-icon">🎁</div>
          <h2>Start a gift exchange</h2>
          <ol className="santa-steps">
            <li>Create an exchange and set a budget and date.</li>
            <li>Invite people with a link or by email. Everyone shares their wish list.</li>
            <li>Draw names. Each person gets an email with who they're buying for.</li>
          </ol>
          <button className="btn btn-primary" onClick={() => setForm(true)}>
            <Plus size={16} /> New exchange
          </button>
        </div>
      ) : (
        <div className="list-grid">
          {exchanges.map((x) => (
            <ExchangeCard key={x.id} x={x} />
          ))}
        </div>
      )}

      {form && <ExchangeForm onClose={() => setForm(false)} onSaved={(x) => navigate(`/exchanges/${x.id}`)} />}
    </div>
  );
}

function ExchangeCard({ x }) {
  const cd = countdown(x.event_date);
  const budget = formatPrice(x.budget, x.currency || undefined);
  return (
    <div className="list-card">
      <Link to={`/exchanges/${x.id}`} className="list-card-link">
        <span className="list-icon list-icon-md santa-icon">🎅</span>
        <div className="list-card-body">
          <h3>{x.name}</h3>
          <p className="muted small">
            {x.isOrganizer ? "You're organizing" : `Organized by ${x.organizer}`}
            {x.event_date ? ` · ${formatDate(x.event_date)}` : ""}
          </p>
          <div className="list-card-meta">
            <span>
              <Users size={12} /> {x.joined} joined
              {x.invited ? ` · ${x.invited} invited` : ""}
              {budget ? ` · ${budget}` : ""}
            </span>
            {x.status === "drawn" ? (
              <span className="countdown">{x.matchName ? `You have ${x.matchName}` : "Names drawn"}</span>
            ) : (
              cd && cd !== "Past" && <span className="countdown subtle">{cd}</span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

// Create or edit an exchange's details
export function ExchangeForm({ exchange, onClose, onSaved }) {
  const { user, config } = useApp();
  const [form, setForm] = useState({
    name: exchange?.name || `Secret Santa ${new Date().getFullYear()}`,
    event_date: dateOnly(exchange?.event_date),
    budget: exchange?.budget || "",
    message: exchange?.message || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = {
      name: form.name.trim(),
      event_date: form.event_date ? `${form.event_date} 12:00:00.000Z` : "",
      budget: form.budget === "" ? 0 : Number(form.budget),
      message: form.message.trim(),
    };
    try {
      const saved = exchange ? await pb.collection("exchanges").update(exchange.id, body) : await pb.collection("exchanges").create({ ...body, owner: user.id });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err, exchange ? "save the exchange" : "create the exchange"));
      setBusy(false);
    }
  };

  return (
    <Modal title={exchange ? "Edit exchange" : "New Secret Santa"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Name
          <input value={form.name} onChange={set("name")} required maxLength={100} autoFocus placeholder="e.g. Family Secret Santa" />
        </label>
        <div className="row-2">
          <label>
            Exchange day <span className="muted">(optional)</span>
            <input type="date" value={form.event_date} onChange={set("event_date")} />
          </label>
          <label>
            Budget per gift ({config.currency}) <span className="muted">(optional)</span>
            <input type="number" min="0" step="1" value={form.budget} onChange={set("budget")} placeholder="e.g. 25" />
          </label>
        </div>
        <label>
          Note for everyone <span className="muted">(optional)</span>
          <textarea rows={3} value={form.message} onChange={set("message")} maxLength={1000} placeholder="e.g. We'll swap gifts after dinner on Christmas Eve!" />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : exchange ? "Save changes" : "Create exchange"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
