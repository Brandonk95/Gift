// Notices when a newer version of the app has been put on the server while this copy
// is open, by checking /version.json now and then (see vite.config.js).
import { useEffect, useState } from "react";

/* global __APP_VERSION__ */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";

const EVERY = 5 * 60 * 1000; // check every 5 minutes, and whenever the app comes back to the front

// "1.10.0" > "1.9.2"
export function newer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

async function fetchLatest() {
  const r = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) return null;
  const d = await r.json();
  return d && typeof d.version === "string" ? d : null;
}

// { version, date, changes: [{ version, date, notes }] } once there's a newer version, else null.
// `changes` only holds the versions this copy doesn't have yet.
export function useNewVersion(enabled = true) {
  const [update, setUpdate] = useState(null);
  useEffect(() => {
    if (!enabled || APP_VERSION === "dev") return;
    let stop = false;
    let last = 0;
    const check = async () => {
      if (stop || document.visibilityState === "hidden" || Date.now() - last < 30000) return;
      last = Date.now();
      try {
        const d = await fetchLatest();
        if (stop || !d || !newer(d.version, APP_VERSION)) return;
        const changes = (Array.isArray(d.changes) ? d.changes : []).filter((c) => newer(c.version, APP_VERSION));
        setUpdate({ version: d.version, date: d.date, changes });
      } catch {
        // offline or the server is restarting: try again later
      }
    };
    check();
    const timer = setInterval(check, EVERY);
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    window.addEventListener("online", onShow);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.removeEventListener("online", onShow);
    };
  }, [enabled]);
  return update;
}
