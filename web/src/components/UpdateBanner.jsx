import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { APP_VERSION, useNewVersion } from "../lib/updates.js";

// "A new version is ready": what changed and a button to switch to it.
export default function UpdateBanner({ enabled }) {
  const update = useNewVersion(enabled);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("update-later") || "";
    } catch {
      return "";
    }
  });
  if (!update || hidden === update.version) return null;

  const later = () => {
    setHidden(update.version);
    try {
      sessionStorage.setItem("update-later", update.version);
    } catch {
      // private mode: it just comes back on the next check
    }
  };
  const notes = update.changes.flatMap((c) => c.notes || []).slice(0, 6);

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-head">
        <Sparkles size={18} />
        <div>
          <strong>A new version is ready</strong>
          <span className="muted small">
            Version {update.version} · you have {APP_VERSION}
          </span>
        </div>
        <button type="button" className="icon-btn" aria-label="Remind me later" onClick={later}>
          <X size={16} />
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="update-banner-notes">
          {notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="update-banner-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={later}>
          Later
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
          Update now
        </button>
      </div>
    </div>
  );
}
