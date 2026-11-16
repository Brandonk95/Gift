import { useState } from "react";
import { PartyPopper, Sparkles, X } from "lucide-react";
import { APP_VERSION, markSeen, useNewVersion, whatsNew } from "../lib/updates.js";

// Two notices about versions, for signed-in people:
// - "A new version is ready": a newer version is on the server while this copy is open
// - "Updated to version …": the update has just loaded, with what's new in it (shown once)
export default function UpdateBanner({ user }) {
  const update = useNewVersion(!!user);
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem("update-later") || "";
    } catch {
      return "";
    }
  });
  const [fresh, setFresh] = useState(() => whatsNew(user));
  const [freshFor, setFreshFor] = useState(user?.id);
  if (user?.id !== freshFor) {
    // signed in or out while the app was open
    setFreshFor(user?.id);
    setFresh(whatsNew(user));
  }

  if (update && hidden !== update.version) {
    const later = () => {
      setHidden(update.version);
      try {
        sessionStorage.setItem("update-later", update.version);
      } catch {
        // private mode: it just comes back on the next check
      }
    };
    return (
      <Notice
        icon={<Sparkles size={18} />}
        title="A new version is ready"
        sub={`Version ${update.version} · you have ${APP_VERSION}`}
        changes={update.changes}
        onClose={later}
        closeLabel="Remind me later"
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={later}>
          Later
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.location.reload()}>
          Update now
        </button>
      </Notice>
    );
  }

  if (fresh) {
    const done = () => {
      markSeen();
      setFresh(null);
    };
    return (
      <Notice icon={<PartyPopper size={18} />} title={`Updated to version ${fresh.version}`} sub="Here's what's new" changes={fresh.changes} onClose={done} closeLabel="Close">
        <button type="button" className="btn btn-primary btn-sm" onClick={done}>
          Got it
        </button>
      </Notice>
    );
  }
  return null;
}

function Notice({ icon, title, sub, changes, onClose, closeLabel, children }) {
  const notes = changes.flatMap((c) => c.notes || []).slice(0, 6);
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <div className="update-banner-head">
        {icon}
        <div>
          <strong>{title}</strong>
          <span className="muted small">{sub}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
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
      <div className="update-banner-actions">{children}</div>
    </div>
  );
}
