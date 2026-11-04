import { useState } from "react";
import Modal from "./Modal.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { formatPrice } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";

// Totals for the friends chipping in on one gift
export function pledgeSummary(item, pledges, userId) {
  const target = (item.price || 0) * (item.quantity || 1);
  const total = pledges.reduce((n, p) => n + (p.amount || 0), 0);
  return { target, total, count: pledges.length, mine: pledges.find((p) => p.user === userId) || null, funded: target > 0 && total >= target };
}

// Join, change or leave a group gift
export default function ChipIn({ item, pledges, currency, hideNames, hidePrice, shareOpts, onClose, onSaved }) {
  const { user, notify } = useApp();
  const s = pledgeSummary(item, pledges, user.id);
  const others = pledges.filter((p) => p.user !== user.id);
  const othersTotal = others.reduce((n, p) => n + (p.amount || 0), 0);
  const suggested = s.target > othersTotal ? Math.ceil((s.target - othersTotal) / (others.length ? 2 : 1)) : "";
  const [amount, setAmount] = useState(s.mine ? String(s.mine.amount || "") : String(suggested || ""));
  const [busy, setBusy] = useState(false);
  const fmt = (n) => formatPrice(n, currency, { showZero: true });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { amount: amount === "" ? 0 : Number(amount) };
    try {
      if (s.mine) await pb.collection("pledges").update(s.mine.id, body, shareOpts);
      else await pb.collection("pledges").create({ ...body, item: item.id, user: user.id }, shareOpts);
      notify(s.mine ? "Updated your share" : `You're chipping in on “${item.name}” 🤝 Sort out paying with the others.`);
      onSaved();
    } catch (err) {
      notify(errorMessage(err, "chip in"), "error");
      setBusy(false);
    }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await pb.collection("pledges").delete(s.mine.id, shareOpts);
      notify(`You're no longer chipping in on “${item.name}”`);
      onSaved();
    } catch (err) {
      notify(errorMessage(err, "leave this group gift"), "error");
      setBusy(false);
    }
  };

  return (
    <Modal title={s.mine ? "Your share" : "Chip in together"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <p className="muted small">
          Split <strong>{item.name}</strong> with other friends. Everyone who chips in shows up here, and the gift counts as taken once the total covers it. You'll
          sort out paying each other yourselves.
        </p>
        {s.target > 0 && !hidePrice && (
          <div className="chip-progress">
            <div className="progress">
              <span style={{ width: `${Math.min(100, (s.total / s.target) * 100)}%` }} />
            </div>
            <span className="small">
              {fmt(s.total)} of {fmt(s.target)} {s.funded ? "· fully covered 🎉" : `· ${fmt(s.target - s.total)} to go`}
            </span>
          </div>
        )}
        {others.length > 0 && (
          <p className="small">
            Already in:{" "}
            {hideNames
              ? `${others.length} ${others.length === 1 ? "friend" : "friends"}`
              : others.map((p) => `${p.reserver_name || "A friend"}${p.amount && !hidePrice ? ` (${fmt(p.amount)})` : ""}`).join(", ")}
          </p>
        )}
        <label>
          How much will you put in? ({currency}) <span className="muted">(optional)</span>
          <input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={suggested ? `e.g. ${suggested}` : "e.g. 20"} autoFocus />
        </label>
        <div className="form-actions">
          {s.mine && (
            <button type="button" className="btn btn-ghost btn-danger-text" onClick={leave} disabled={busy}>
              Leave
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : s.mine ? "Save" : "Chip in"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
