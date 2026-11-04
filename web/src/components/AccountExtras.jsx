import { useEffect, useRef, useState } from "react";
import { BellRing, BookmarkPlus, Smartphone, Trash2 } from "lucide-react";
import { errorMessage, pb } from "../lib/pb.js";
import { useApp } from "../lib/app.jsx";

// Notification kinds (keys match EMAIL_KINDS in pb_hooks/lib/util.js)
const PUSH_KINDS = [
  ["digest", "New gifts on lists you follow", "Once a night, like “Sam added 3 gifts”"],
  ["reminders", "Reservation reminders", "The day before a reservation runs out"],
  ["occasions", "Upcoming occasions", "A week before a followed list's date"],
  ["questions", "Questions and answers", "About your gifts, or ones you asked"],
  ["prices", "Price drops", "On gifts you reserved"],
  ["santa", "Secret Santa", "Messages and wish list updates"],
  ["reservations", "Reservation confirmations", "Right after you reserve something"],
];

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || isIOS() ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${os} · ${browser}${installed() ? " (app)" : ""}`;
}

export function PushSettings() {
  const { user, config, notify } = useApp();
  const app = config.appName || "GiftMe";
  const [devices, setDevices] = useState(null);
  const [here, setHere] = useState(""); // this browser's endpoint, if subscribed
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(user.push_prefs || {});
  const [denied, setDenied] = useState(supported() && Notification.permission === "denied");

  const load = async () => {
    try {
      setDevices(await pb.collection("push_subs").getFullList({ sort: "-created" }));
    } catch {
      setDevices([]);
    }
    if (supported()) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setHere(sub?.endpoint || "");
    }
  };

  useEffect(() => {
    load();
    if (window.location.hash === "#notifications") document.getElementById("notifications")?.scrollIntoView({ behavior: "smooth" });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setDenied(perm === "denied");
        notify(perm === "denied" ? "Notifications are blocked for this site. Allow them in your browser's site settings, then try again." : "Notifications weren't turned on.", "error");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { publicKey } = await pb.send("/api/giftlist/push/key");
      let sub = await reg.pushManager.getSubscription();
      // an old subscription (another account, or a server key that changed) is replaced
      if (sub) await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const json = sub.toJSON();
      await pb.collection("push_subs").create({ user: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label: deviceLabel() });
      await load();
      try {
        await pb.send("/api/giftlist/push/test", { method: "POST" });
        notify("Notifications are on. A test one is on its way.");
      } catch {
        notify("Notifications are on.");
      }
    } catch (err) {
      notify(errorMessage(err, "turn on notifications"), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d) => {
    try {
      if (d.endpoint === here) {
        const reg = await navigator.serviceWorker.getRegistration();
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setHere("");
      }
      await pb.collection("push_subs").delete(d.id);
      setDevices((ds) => ds.filter((x) => x.id !== d.id));
    } catch (err) {
      notify(errorMessage(err, "turn off notifications on that device"), "error");
    }
  };

  const test = async () => {
    try {
      const r = await pb.send("/api/giftlist/push/test", { method: "POST" });
      notify(r.sent ? `Test sent to ${r.sent} device${r.sent === 1 ? "" : "s"}.` : "The notification services didn't accept the test. Try turning notifications off and on again.", r.sent ? "success" : "error");
    } catch (err) {
      notify(errorMessage(err, "send a test notification"), "error");
    }
  };

  const toggle = async (key) => {
    const next = { ...prefs };
    if (next[key] === false) delete next[key];
    else next[key] = false;
    setPrefs(next);
    try {
      await pb.collection("users").update(user.id, { push_prefs: next });
    } catch (err) {
      setPrefs(prefs);
      notify(errorMessage(err, "save your notification settings"), "error");
    }
  };

  const onHere = devices?.some((d) => d.endpoint === here);

  return (
    <section className="panel" id="notifications">
      <div className="panel-head">
        <h2>Phone notifications</h2>
        <p className="muted small">Get the same news as the emails as a notification on your phone or computer, even when {app} is closed.</p>
      </div>

      {!supported() ? (
        <div className="alert">
          {isIOS() && !installed()
            ? `On iPhone and iPad, add ${app} to your Home Screen first (Share → Add to Home Screen), open it from there, and come back to this page.`
             : `This browser can't show notifications from websites. Try Chrome, Edge, Firefox or Safari, or install ${app} on your phone.`}
        </div>
      ) : onHere ? (
        <div className="push-status on">
          <BellRing size={18} /> <span>Notifications are on for this device.</span>
          <button className="btn btn-secondary btn-sm" onClick={test}>
            Send a test
          </button>
        </div>
      ) : (
        <div className="push-status">
          <Smartphone size={18} />
          <span>{denied ? "Notifications are blocked for this site in your browser's settings. Allow them there, then press the button." : "Turn them on for this device."}</span>
          <button className="btn btn-primary btn-sm" onClick={enable} disabled={busy}>
            <BellRing size={15} /> {busy ? "Turning on…" : "Turn on"}
          </button>
        </div>
      )}

      {devices?.length > 0 && (
        <>
          <ul className="device-list">
            {devices.map((d) => (
              <li key={d.id}>
                <Smartphone size={15} className="muted" />
                <span>
                  {d.label || "Device"}
                  {d.endpoint === here && <span className="badge">this device</span>}
                </span>
                <button className="icon-btn" title="Turn off for this device" aria-label="Turn off for this device" onClick={() => remove(d)}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
          <div className="check-list email-prefs">
            {PUSH_KINDS.map(([key, label, hint]) => (
              <label key={key} className="toggle">
                <input type="checkbox" checked={prefs[key] !== false} onChange={() => toggle(key)} />
                <span>
                  <strong>{label}</strong>
                  <span className="muted small"> · {hint}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// The "Add to GiftMe" bookmark: on any store page it reads the link, name, picture and
// price and opens /share, where you pick the list. Plain ES5 so it runs on any site.
export function bookmarkletCode(origin) {
  const js = `(function(){var d=document,q=function(s,a){var e=d.querySelector(s);return e?(a?e[a]||e.getAttribute(a):e.getAttribute('content'))||'':''};
var img=q('meta[property="og:image"]')||q('#landingImage','src')||q('#imgBlkFront','src')||q('meta[name="twitter:image"]')||q('[itemprop=image]','src');
try{if(img)img=new URL(img,location.href).href}catch(e){img=''}
var p=q('meta[property="product:price:amount"]')||q('meta[property="og:price:amount"]')||q('[itemprop=price]');
if(!p){var o=d.querySelector('.a-price .a-offscreen');if(o)p=o.textContent}
if(!p){var s=d.querySelectorAll('script[type="application/ld+json"]');for(var i=0;i<s.length&&!p;i++){var m=/"price"\\s*:\\s*"?([0-9.,]+)/.exec(s[i].textContent);if(m)p=m[1]}}
p=String(p||'').replace(/[^0-9.,]/g,'');if(/^[0-9.]*,[0-9]{1,2}$/.test(p))p=p.replace(/\\./g,'').replace(',','.');p=p.replace(/,/g,'');
var t=q('meta[property="og:title"]')||d.title;
var u=new URLSearchParams({url:location.href,title:t,image:img,price:p});
window.open(${JSON.stringify(origin)}+'/share?'+u.toString(),'_blank')})()`;
  // # is encoded too: some browsers cut a bookmark's address at the first #
  return "javascript:" + encodeURI(js.replace(/\n/g, "")).replace(/#/g, "%23");
}

export function AddButton() {
  const { config, notify } = useApp();
  const link = useRef(null);
  // React warns about javascript: links, so the address is set directly
  useEffect(() => {
    link.current?.setAttribute("href", bookmarkletCode(window.location.origin));
  }, []);
  return (
    <section className="panel" id="add-button">
      <div className="panel-head">
        <h2>Add-to-{config.appName || "GiftMe"} button</h2>
        <p className="muted small">For computers: put this button in your bookmarks bar. On any store page, click it and the gift goes onto your list with its name, picture and price.</p>
      </div>
      <div className="bookmarklet-row">
        <a ref={link} className="bookmarklet" draggable="true" onClick={(e) => (e.preventDefault(), notify("Drag the button up to your bookmarks bar instead of clicking it here."))}>
          <BookmarkPlus size={16} /> Add to {config.appName || "GiftMe"}
        </a>
        <ol className="muted small bookmarklet-steps">
          <li>Show your bookmarks bar (Ctrl+Shift+B, or ⌘+Shift+B on a Mac).</li>
          <li>Drag the button onto it.</li>
          <li>On a product page, click it and pick a list.</li>
        </ol>
      </div>
      <p className="muted small">On your phone, use the store app's Share button and choose {config.appName || "GiftMe"} instead (after adding it to your home screen).</p>
    </section>
  );
}
