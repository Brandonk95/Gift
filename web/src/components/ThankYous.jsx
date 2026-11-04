import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { daysUntil, formatDate } from "../lib/format.js";
import { useApp } from "../lib/app.jsx";

// After the occasion: who gave what, with a checklist for thank-you notes
export default function ThankYous({ list, onItemChange }) {
  const { notify } = useApp();
  const [rows, setRows] = useState(null);
  const days = daysUntil(list.event_date);
  const past = days !== null && days < 0;

  useEffect(() => {
    if (!list.reveal_givers || !past) return;
    pb.send(`/api/giftlist/lists/${list.id}/givers`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [list.id, list.reveal_givers, past]);

  if (!list.reveal_givers || !list.event_date) return null;
  if (!past) {
    return (
      <p className="hint-line">
        <Heart size={14} /> After {formatDate(list.event_date)} you'll see who gave what here, with a checklist for thank-you notes.
      </p>
    );
  }
  if (!rows || !rows.length) return null;

  const toggle = async (row) => {
    try {
      const saved = await pb.collection("items").update(row.item, { thanked: !row.thanked });
      setRows((prev) => prev.map((r) => (r.item === row.item ? { ...r, thanked: saved.thanked } : r)));
      onItemChange(saved);
    } catch (err) {
      notify(errorMessage(err, "update your thank-you list"), "error");
    }
  };
  const done = rows.filter((r) => r.thanked).length;

  return (
    <section className="panel thanks">
      <div className="panel-head">
        <h2>
          <Heart size={18} /> Thank-you list
        </h2>
        <p className="muted small">
          Who gave what for {list.title}. {done}/{rows.length} thanked.
        </p>
      </div>
      <ul className="thanks-list">
        {rows.map((r) => (
          <li key={r.item} className={r.thanked ? "done" : ""}>
            <label className="toggle">
              <input type="checkbox" checked={r.thanked} onChange={() => toggle(r)} aria-label={`Thanked for ${r.name}`} />
              <span>
                <strong>{r.name}</strong>
                <span className="muted small"> · {r.givers.length ? `from ${r.givers.join(", ")}` : "giver unknown (not reserved in the app)"}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
