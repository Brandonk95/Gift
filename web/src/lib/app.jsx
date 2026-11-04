import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pb } from "./pb.js";
import { applyPrefs, loadLocalPrefs, normalizePrefs, saveLocalPrefs } from "./theme.js";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null);
  const [config, setConfig] = useState({ appName: "Gift List", smtpEnabled: false, currency: "USD", photoSearch: false, reservationDays: 7 });
  const [toast, setToast] = useState(null);
  const [prefs, setPrefsState] = useState(() => {
    const rec = pb.authStore.isValid ? pb.authStore.record : null;
    const p = rec?.prefs && Object.keys(rec.prefs).length ? normalizePrefs(rec.prefs) : loadLocalPrefs();
    applyPrefs(p);
    return p;
  });
  const saveTimer = useRef(null);

  // Errors stay up longer (and longer still when there's more to read); click to dismiss.
  const notify = useCallback((message, type = "ok") => {
    const id = Date.now();
    const ms = type === "error" ? Math.min(15000, 6000 + message.length * 40) : 3500;
    setToast({ id, message, type });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), ms);
  }, []);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      const rec = pb.authStore.isValid ? pb.authStore.record : null;
      setUser(rec);
      // adopt the account's saved appearance when logging in
      if (rec?.prefs && Object.keys(rec.prefs).length) {
        const p = normalizePrefs(rec.prefs);
        setPrefsState(p);
        applyPrefs(p);
        saveLocalPrefs(p);
      }
    });
    if (pb.authStore.isValid) {
      pb.collection("users")
        .authRefresh()
        .catch((err) => {
          // only sign out when the server actually rejected the session, not when it's unreachable
          if (err.status === 401 || err.status === 404) {
            pb.authStore.clear();
            notify("Your login session expired (or the account was removed). Please log in again.", "error");
          }
        });
    }
    pb.send("/api/giftlist/config", {})
      .then((c) => {
        setConfig(c);
        if (c.appName) document.title = c.appName;
      })
      .catch(() => {});
    return unsub;
  }, [notify]);

  // Follow OS dark mode changes live when mode = system
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPrefs(prefs);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [prefs]);

  const setPrefs = useCallback(
    (patch) => {
      setPrefsState((prev) => {
        const next = normalizePrefs({ ...prev, ...patch });
        applyPrefs(next);
        saveLocalPrefs(next);
        if (pb.authStore.isValid) {
          clearTimeout(saveTimer.current);
          const id = pb.authStore.record.id;
          saveTimer.current = setTimeout(() => {
            pb.collection("users")
              .update(id, { prefs: next })
              .catch(() => notify("Couldn't save your appearance settings to your account. They're still applied on this device.", "error"));
          }, 400);
        }
        return next;
      });
    },
    [notify]
  );

  return (
    <AppContext.Provider value={{ user, config, notify, prefs, setPrefs }}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.type}`} role={toast.type === "error" ? "alert" : "status"} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
