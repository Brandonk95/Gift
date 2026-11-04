import { Link } from "react-router-dom";
import { Check, Gift, ListPlus, Share2, X } from "lucide-react";
import { useApp } from "../lib/app.jsx";

// First-run guide on the dashboard: make a list, add a gift, share it.
// Disappears once all three are done, or when dismissed.
export default function GettingStarted({ lists, counts, onNewList }) {
  const { prefs, setPrefs } = useApp();
  const first = lists.find((l) => !l.archived) || lists[0];
  const withGifts = lists.find((l) => counts[l.id] > 0);
  const steps = [
    {
      done: lists.length > 0,
      icon: ListPlus,
      title: "Make a list",
      text: "Christmas, a birthday, a wedding: one list per occasion.",
      action: (
        <button className="btn btn-primary btn-sm" onClick={onNewList}>
          Create a list
        </button>
      ),
    },
    {
      done: !!withGifts,
      icon: Gift,
      title: "Add a gift",
      text: "Paste a link from any store and the name, price and picture fill in for you.",
      action: first && (
        <Link className="btn btn-primary btn-sm" to={`/lists/${first.id}`}>
          Add gifts
        </Link>
      ),
    },
    {
      done: !!prefs.shared,
      icon: Share2,
      title: "Share it",
      text: "Send the link or a QR code. Friends reserve gifts without you ever seeing what's taken.",
      action: (withGifts || first) && (
        <Link className="btn btn-primary btn-sm" to={`/lists/${(withGifts || first).id}?share=1`}>
          Share a list
        </Link>
      ),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (prefs.onboarded || doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="getting-started panel">
      <div className="getting-started-head">
        <div>
          <h2>Get started in 3 steps</h2>
          <p className="muted small">
            {doneCount} of {steps.length} done
          </p>
        </div>
        <button className="icon-btn" onClick={() => setPrefs({ onboarded: true })} aria-label="Hide the getting-started guide" title="Hide this guide">
          <X size={16} />
        </button>
      </div>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="steps">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.title} className={`step ${s.done ? "is-done" : ""} ${i === next ? "is-next" : ""}`}>
              <span className="step-mark">{s.done ? <Check size={16} /> : <Icon size={16} />}</span>
              <div className="step-body">
                <strong>{s.title}</strong>
                <span className="muted small">{s.text}</span>
              </div>
              {!s.done && i === next && s.action}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
