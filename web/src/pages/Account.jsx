import { useEffect, useState } from "react";
import { Camera, Check, LayoutGrid, List, Monitor, Moon, Rows3, Star, Sun, Trash2, X } from "lucide-react";
import { Avatar } from "../components/Layout.jsx";
import { AddButton, PushSettings } from "../components/AccountExtras.jsx";
import { Segmented, Swatches } from "../components/ui.jsx";
import { errorMessage, pb } from "../lib/pb.js";
import { ACCENTS, FONTS, RADII, VIEWS } from "../lib/theme.js";
import { useApp } from "../lib/app.jsx";

const MODE_OPTS = { system: { label: "System", icon: Monitor }, light: { label: "Light", icon: Sun }, dark: { label: "Dark", icon: Moon } };
const VIEW_OPTS = { grid: { label: VIEWS.grid.label, icon: LayoutGrid }, compact: { label: VIEWS.compact.label, icon: Rows3 }, list: { label: VIEWS.list.label, icon: List } };

// Optional emails (keys match EMAIL_KINDS in pb_hooks/lib/util.js)
const EMAIL_KINDS = [
  ["reservations", "Reservation confirmations", "When you reserve a gift"],
  ["reminders", "Reservation reminders", "Before a reservation runs out, and when it's released"],
  ["digest", "Lists you follow", "One email a night with the gifts added that day"],
  ["occasions", "Upcoming occasions", "A week before a followed list's date"],
  ["questions", "Questions and answers", "When a friend asks about your gifts, or your question is answered"],
  ["prices", "Price drops", "When a gift you reserved gets cheaper"],
  ["santa", "Secret Santa messages", "Messages and wish list updates in your exchanges"],
];

function EmailSettings() {
  const { user, config, notify } = useApp();
  const [prefs, setPrefs] = useState(user.email_prefs || {});

  useEffect(() => {
    if (window.location.hash === "#emails") document.getElementById("emails")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const toggle = async (key) => {
    const next = { ...prefs };
    if (next[key] === false) delete next[key];
    else next[key] = false;
    setPrefs(next);
    try {
      await pb.collection("users").update(user.id, { email_prefs: next });
    } catch (err) {
      setPrefs(prefs);
      notify(errorMessage(err, "save your email settings"), "error");
    }
  };

  return (
    <section className="panel" id="emails">
      <div className="panel-head">
        <h2>Emails</h2>
        <p className="muted small">
          {config.smtpEnabled
            ? "Choose which emails you get. Account emails (verification, password reset) and Secret Santa draws always come through."
            : "Email isn't set up on this server yet, so none of these are sent right now."}
        </p>
      </div>
      <div className="check-list email-prefs">
        {EMAIL_KINDS.map(([key, label, hint]) => (
          <label key={key} className="toggle">
            <input type="checkbox" checked={prefs[key] !== false} onChange={() => toggle(key)} />
            <span>
              <strong>{label}</strong>
              <span className="muted small"> · {hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

export default function Account() {
  const { user, config, notify, prefs, setPrefs } = useApp();
  const [name, setName] = useState(user.name || "");
  const [pw, setPw] = useState({ oldPassword: "", password: "", passwordConfirm: "" });
  const [cats, setCats] = useState([]);
  const [newCat, setNewCat] = useState({ icon: "", name: "" });
  const [newEmail, setNewEmail] = useState(null); // null = form closed
  const [emailSentTo, setEmailSentTo] = useState("");

  useEffect(() => {
    pb.collection("categories")
      .getFullList({ filter: pb.filter("owner = {:me}", { me: user.id }), sort: "name" })
      .then(setCats)
      .catch(() => {});
  }, [user.id]);

  const saveName = async (e) => {
    e.preventDefault();
    try {
      await pb.collection("users").update(user.id, { name: name.trim() });
      notify("Name updated");
    } catch (err) {
      notify(errorMessage(err, "update your name"), "error");
    }
  };

  const uploadAvatar = async (f) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return notify(`“${f.name}” isn't an image. Use a JPG, PNG, WebP or GIF.`, "error");
    if (f.size > 5 * 1024 * 1024) return notify(`“${f.name}” is ${(f.size / 1024 / 1024).toFixed(1)} MB. Profile pictures must be 5 MB or smaller.`, "error");
    try {
      await pb.collection("users").update(user.id, { avatar: f });
      notify("Profile picture updated");
    } catch (err) {
      notify(errorMessage(err, "upload your profile picture"), "error");
    }
  };

  const removeAvatar = async () => {
    try {
      await pb.collection("users").update(user.id, { avatar: null });
    } catch (err) {
      notify(errorMessage(err, "remove your profile picture"), "error");
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.password !== pw.passwordConfirm) return notify("The new password and confirmation don't match. Retype them so they're exactly the same.", "error");
    if (user.guest) {
      // signed in with an email code: no current password to check
      try {
        const auth = await pb.send("/api/giftlist/account/password", { method: "POST", body: { password: pw.password, passwordConfirm: pw.passwordConfirm } });
        pb.authStore.save(auth.token, auth.record);
        setPw({ oldPassword: "", password: "", passwordConfirm: "" });
        notify("Password set. You can now log in with your email and password.");
      } catch (err) {
        notify(errorMessage(err, "set your password"), "error");
      }
      return;
    }
    try {
      await pb.collection("users").update(user.id, pw);
      // changing the password invalidates the current token
      await pb.collection("users").authWithPassword(user.email, pw.password);
      setPw({ oldPassword: "", password: "", passwordConfirm: "" });
      notify("Password changed");
    } catch (err) {
      notify(errorMessage(err, "change your password"), "error");
    }
  };

  const verify = async () => {
    try {
      await pb.collection("users").requestVerification(user.email);
      notify("Verification email sent. Check your inbox, and your spam or junk folder if it doesn't show up.");
    } catch (err) {
      notify(errorMessage(err, "send the verification email"), "error");
    }
  };

  const changeEmail = async (e) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (email.toLowerCase() === user.email.toLowerCase()) return notify("That's already your email address.", "error");
    try {
      await pb.collection("users").requestEmailChange(email);
      setEmailSentTo(email);
      setNewEmail(null);
    } catch (err) {
      notify(errorMessage(err, "change your email"), "error");
    }
  };

  const deleteAccount = async () => {
    const typed = prompt(`This permanently deletes your account, all your lists and gifts, and your reservations on friends' lists.\n\nType your email (${user.email}) to confirm:`);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== user.email.toLowerCase()) {
      return notify("The email you typed doesn't match your account email, so nothing was deleted.", "error");
    }
    try {
      await pb.collection("users").delete(user.id);
      pb.authStore.clear();
      notify("Your account has been deleted.");
    } catch (err) {
      notify(errorMessage(err, "delete your account"), "error");
    }
  };

  const addCat = async (e) => {
    e.preventDefault();
    try {
      const c = await pb.collection("categories").create({ name: newCat.name.trim(), icon: newCat.icon.trim() || "🏷️", owner: user.id });
      setCats((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCat({ icon: "", name: "" });
    } catch (err) {
      notify(errorMessage(err, "add the category"), "error");
    }
  };

  const delCat = async (c) => {
    if (!confirm(`Delete category "${c.name}"? Gifts using it become uncategorized.`)) return;
    try {
      await pb.collection("categories").delete(c.id);
      setCats((prev) => prev.filter((x) => x.id !== c.id));
    } catch (err) {
      notify(errorMessage(err, `delete the “${c.name}” category`), "error");
    }
  };

  return (
    <div className="page account">
      <h1>Account</h1>

      <section className="panel">
        <div className="panel-head">
          <h2>Appearance</h2>
          <p className="muted small">Saved to your account, so it follows you to every device.</p>
        </div>

        <div className="setting">
          <div className="setting-label">Theme</div>
          <Segmented value={prefs.mode} onChange={(mode) => setPrefs({ mode })} options={MODE_OPTS} ariaLabel="Theme" />
        </div>
        <div className="setting">
          <div className="setting-label">Accent color</div>
          <Swatches value={prefs.accent} onChange={(accent) => setPrefs({ accent })} colors={ACCENTS} />
        </div>
        <div className="setting">
          <div className="setting-label">Font</div>
          <div className="font-options">
            {Object.entries(FONTS).map(([k, f]) => (
              <button key={k} type="button" className={`font-opt ${prefs.font === k ? "active" : ""}`} style={{ fontFamily: f.stack }} onClick={() => setPrefs({ font: k })}>
                <span className="font-sample">Aa</span>
                <span className="font-name">{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <div className="setting-label">Corners</div>
          <Segmented value={prefs.radius} onChange={(radius) => setPrefs({ radius })} options={RADII} ariaLabel="Corner style" />
        </div>
        <div className="setting">
          <div className="setting-label">
            Gift layout
            <span className="muted small">Also switchable from the toolbar on any list.</span>
          </div>
          <Segmented value={prefs.view} onChange={(view) => setPrefs({ view })} options={VIEW_OPTS} ariaLabel="Default layout" />
        </div>

        <div className="preview-card">
          <div className="preview-img">🎧</div>
          <div className="preview-body">
            <div className="preview-title">
              Wireless headphones <Star size={15} fill="currentColor" className="star-on" />
            </div>
            <span className="item-price">$89.00</span>
            <div className="preview-actions">
              <span className="btn btn-primary btn-sm">I'll get this</span>
              <span className="btn btn-secondary btn-sm">View</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Profile</h2>
        </div>
        <div className="profile-row">
          <label className="avatar-upload" title="Change profile picture">
            <Avatar user={user} size={64} />
            <span className="avatar-upload-badge">
              <Camera size={14} />
            </span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
          <form className="profile-name" onSubmit={saveName}>
            <label>
              Display name <span className="muted">(shown on your shared lists)</span>
              <div className="input-group">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
                <button className="btn btn-primary">Save</button>
              </div>
            </label>
            {user.avatar ? (
              <button type="button" className="link-btn small" onClick={removeAvatar}>
                Remove profile picture
              </button>
            ) : (
              <span className="muted small">
                No picture uploaded, so we show your{" "}
                <a href="https://gravatar.com" target="_blank" rel="noopener noreferrer">
                  Gravatar
                </a>{" "}
                if you have one. Click the circle to upload your own.
              </span>
            )}
          </form>
        </div>
        <p className="small email-row">
          {user.email}{" "}
          {user.verified ? (
            <span className="chip-static ok">
              <Check size={12} /> verified
            </span>
          ) : (
            <>
              <span className="chip-static subtle">not verified</span>{" "}
              {config.smtpEnabled && (
                <button className="link-btn" onClick={verify}>
                  Send verification email
                </button>
              )}
            </>
          )}
          {config.smtpEnabled && newEmail === null && (
            <>
              {" · "}
              <button className="link-btn" onClick={() => setNewEmail("")}>
                Change email
              </button>
            </>
          )}
        </p>
        {newEmail !== null && (
          <form className="input-group" onSubmit={changeEmail}>
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="New email address" required autoFocus aria-label="New email address" />
            <button className="btn btn-primary">Send link</button>
            <button type="button" className="btn" onClick={() => setNewEmail(null)}>
              Cancel
            </button>
          </form>
        )}
        {emailSentTo && (
          <div className="alert alert-ok">
            We sent a confirmation link to {emailSentTo}. Your email changes once you click it. Don't see it? Check your spam or junk folder.
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>My categories</h2>
          <p className="muted small">Built-in categories like Electronics and Books are always available. Add your own here.</p>
        </div>
        {cats.length > 0 && (
          <ul className="cat-list">
            {cats.map((c) => (
              <li key={c.id}>
                <span>
                  {c.icon} {c.name}
                </span>
                <button className="icon-btn icon-btn-sm" title={`Delete ${c.name}`} aria-label={`Delete ${c.name}`} onClick={() => delCat(c)}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="input-group" onSubmit={addCat}>
          <input className="emoji-input" value={newCat.icon} onChange={(e) => setNewCat({ ...newCat, icon: e.target.value })} placeholder="🏷️" maxLength={4} aria-label="Category icon" />
          <input value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} placeholder="e.g. Board games" required maxLength={60} aria-label="Category name" />
          <button className="btn btn-primary">Add</button>
        </form>
      </section>

      <PushSettings />
      <EmailSettings />
      <AddButton />

      <section className="panel">
        <div className="panel-head">
          <h2>{user.guest ? "Set a password" : "Change password"}</h2>
        </div>
        {user.guest && (
          <p className="muted small">
            You signed in with a code we emailed you. That always works, but set a password if you'd rather log in with one.
          </p>
        )}
        <form className="form" onSubmit={savePassword}>
          {!user.guest && (
            <label>
              Current password
              <input type="password" value={pw.oldPassword} onChange={(e) => setPw({ ...pw, oldPassword: e.target.value })} required autoComplete="current-password" />
            </label>
          )}
          <div className="row-2">
            <label>
              New password
              <input type="password" minLength={8} value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} required autoComplete="new-password" />
            </label>
            <label>
              Confirm
              <input type="password" minLength={8} value={pw.passwordConfirm} onChange={(e) => setPw({ ...pw, passwordConfirm: e.target.value })} required autoComplete="new-password" />
            </label>
          </div>
          <div>
            <button className="btn btn-primary">{user.guest ? "Set password" : "Change password"}</button>
          </div>
        </form>
      </section>

      <section className="panel panel-danger">
        <div className="danger-row">
          <div>
            <strong>Delete account</strong>
            <p className="muted small">Permanently deletes your account, your lists and your reservations.</p>
          </div>
          <button className="btn btn-danger btn-sm" onClick={deleteAccount}>
            <Trash2 size={14} /> Delete account
          </button>
        </div>
      </section>
    </div>
  );
}
