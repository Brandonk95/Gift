// Minimal service worker so the app can be installed on phones and computers.
// Everything comes from the network as usual; the app shell is kept so opening
// the installed app offline shows a page instead of the browser's error.
const SHELL = "giftlist-shell-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match("/")));
});

// Phone notifications (see pb_hooks/lib/push.js). The message is { title, body, url, tag }.
self.addEventListener("push", (e) => {
  let m = {};
  try {
    m = e.data ? e.data.json() : {};
  } catch (_) {
    m = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(m.title || "GiftMe", {
      body: m.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: m.tag || undefined,
      data: { url: m.url || "/" },
    })
  );
});

// tapping a notification opens its page, reusing an open window when there is one
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin);
  // links always open in this app, whatever address the server put in them
  const target = url.origin === self.location.origin ? url.href : new URL(url.pathname + url.search + url.hash, self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "navigate" in w) return w.navigate(target).then((c) => (c || w).focus());
      }
      return self.clients.openWindow(target);
    })
  );
});
