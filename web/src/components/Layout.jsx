import { useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Gift, ListChecks, LogOut, Moon, ShoppingBag, Shuffle, Sun, UserRound } from "lucide-react";
import { pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { Menu } from "./ui.jsx";

function isDark(mode) {
  if (mode === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return mode === "dark";
}

// Uploaded picture first, then the person's Gravatar (if they have one), then
// their initial. d=404 makes Gravatar answer "not found" instead of a stock image.
export function gravatarUrl(user, px) {
  return user?.email_hash ? `https://gravatar.com/avatar/${user.email_hash}?s=${px}&d=404` : "";
}

export function Avatar({ user, size = 32 }) {
  const initial = (user?.name || user?.email || "?").trim()[0]?.toUpperCase();
  const gravatar = gravatarUrl(user, Math.min(512, Math.round(size * 2)));
  const [missing, setMissing] = useState(""); // the Gravatar address that came back empty
  const src = user?.avatar ? pb.files.getURL(user, user.avatar, { thumb: "100x100" }) : gravatar !== missing ? gravatar : "";
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => !user?.avatar && setMissing(gravatar)} /> : initial}
    </span>
  );
}

const NAV = [
  { to: "/", icon: ListChecks, label: "Lists", end: true, also: /^\/(lists|s)\// },
  { to: "/shopping", icon: ShoppingBag, label: "Shopping" },
  { to: "/exchanges", icon: Shuffle, label: "Secret Santa" },
];

export default function Layout({ children }) {
  const { user, config, prefs, setPrefs } = useApp();
  const navigate = useNavigate();
  const dark = isDark(prefs.mode);
  const { pathname } = useLocation();
  // a list page counts as being in "Lists"
  const cls = (base, also) => ({ isActive }) => `${base} ${isActive || (also && also.test(pathname)) ? "active" : ""}`;

  const logout = () => {
    pb.authStore.clear();
    navigate("/");
  };

  return (
    <div className={`app ${user ? "has-tabbar" : ""}`}>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Gift size={18} strokeWidth={2.2} />
            </span>
            <span className="brand-name">{config.appName || "Gift List"}</span>
          </Link>
          <nav className="nav">
            {user && (
              <div className="nav-links">
                {NAV.map(({ to, icon: Icon, label, end, also }) => (
                  <NavLink key={to} to={to} end={end} className={cls("nav-link", also)}>
                    <Icon size={17} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
            <button
              className="icon-btn"
              onClick={() => setPrefs({ mode: dark ? "light" : "dark" })}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {user ? (
              <div className="user-menu">
                <Menu
                  label="Account menu"
                  buttonClassName="avatar-btn"
                  trigger={
                    <>
                      <Avatar user={user} />
                      <ChevronDown size={14} className="avatar-btn-chevron" />
                    </>
                  }
                  items={[
                    { label: "Account & appearance", icon: UserRound, onClick: () => navigate("/account") },
                    { divider: true },
                    { label: "Log out", icon: LogOut, onClick: logout },
                  ]}
                />
              </div>
            ) : (
              <>
                <NavLink to="/login" className="nav-link">
                  Log in
                </NavLink>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Sign up
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="container main">{children}</main>
      {user && (
        <nav className="tabbar" aria-label="Main">
          {[...NAV, { to: "/account", icon: UserRound, label: "Account" }].map(({ to, icon: Icon, label, end, also }) => (
            <NavLink key={to} to={to} end={end} className={cls("tabbar-link", also)}>
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
      <footer className="footer">
        <div className="container">{config.appName || "Gift List"} · self-hosted with PocketBase</div>
      </footer>
    </div>
  );
}
