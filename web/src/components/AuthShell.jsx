import { useState } from "react";
import { Check, Eye, EyeOff, Gift, Lock, Share2, Sparkles } from "lucide-react";
import { useApp } from "../lib/app.jsx";

const PERKS = [
  { icon: Sparkles, text: "Paste a link from any store and the gift fills itself in" },
  { icon: Share2, text: "Share one link with family and friends" },
  { icon: Lock, text: "They reserve gifts, and you never find out who's getting what" },
];

// The sign-in / sign-up / reset pages: a festive panel next to the form
// (on phones, a short banner above it).
export default function AuthShell({ title, tagline, children, footer }) {
  const { config } = useApp();
  const appName = config.appName || "Gift List";
  return (
    <div className="auth-shell">
      <aside className="auth-showcase" aria-hidden="true">
        <div className="auth-confetti">
          {["🎁", "🎄", "🎂", "💝", "🎈", "✨", "🎀"].map((e, i) => (
            <span key={i} className={`auth-float f${i}`}>
              {e}
            </span>
          ))}
        </div>
        <div className="auth-showcase-body">
          <span className="auth-brand">
            <span className="auth-brand-mark">
              <Gift size={18} strokeWidth={2.2} />
            </span>
            {appName}
          </span>
          <p className="auth-tagline">{tagline}</p>
          <ul className="auth-perks">
            {PERKS.map((p) => (
              <li key={p.text}>
                <span className="auth-perk-icon">
                  <p.icon size={16} />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <div className="auth-mini">
            <span className="auth-mini-thumb">🎧</span>
            <span className="auth-mini-name">
              Noise-cancelling headphones
              <span>Sam's Christmas list</span>
            </span>
            <span className="auth-mini-pill">
              <Check size={12} strokeWidth={3} /> Reserved
            </span>
          </div>
        </div>
      </aside>

      <section className="auth-panel">
        <h1>{title}</h1>
        {children}
        {footer && <div className="auth-links">{footer}</div>}
      </section>
    </div>
  );
}

// A password box with a show/hide button
export function PasswordInput({ value, onChange, autoComplete, minLength, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
