import { Link, NavLink, useNavigate } from "react-router-dom";
import { Gift, ListChecks, LogOut, Moon, ShoppingBag, Shuffle, Sun, UserRound } from "lucide-react";
import { pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";
import { Menu } from "./ui.jsx";

function isDark(mode) {
  if (mode === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches;
  return mode === "dark";
}

export function Avatar({ user, size = 32 }) {
  const initial = (user?.name || user?.email || "?").trim()[0]?.toUpperCase();
  const src = user?.avatar ? pb.files.getURL(user, user.avatar, { thumb: "100x100" }) : "";
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {src ? <img src={src} alt="" /> : initial}
    </span>
  );
}

export default function Layout({ children }) {
  const { user, config, prefs, setPrefs } = useApp();
  const navigate = useNavigate();
  const dark = isDark(prefs.mode);

  const logout = () => {
    pb.authStore.clear();
    navigate("/");
  };

  return (
    <div className="app">
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
              <>
                <NavLink to="/" end className="nav-link">
                  <ListChecks size={17} />
                  <span>Lists</span>
                </NavLink>
                <NavLink to="/shopping" className="nav-link">
                  <ShoppingBag size={17} />
                  <span>Shopping</span>
                </NavLink>
                <NavLink to="/exchanges" className="nav-link">
                  <Shuffle size={17} />
                  <span>Secret Santa</span>
                </NavLink>
              </>
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
                <Link to="/account" className="avatar-link" title="Account & appearance">
                  <Avatar user={user} />
                </Link>
                <Menu
                  label="Account menu"
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
      <footer className="footer">
        <div className="container">{config.appName || "Gift List"} · self-hosted with PocketBase</div>
      </footer>
    </div>
  );
}
