/// <reference path="../pb_data/types.d.ts" />

// How long browsers may keep the app's files, so an update reaches everyone right away:
// - /assets/* have a fingerprint in their name that changes with every update, so they
//   can be kept forever.
// - Everything else (the page itself, sw.js, version.json, icons, the manifest) must be
//   checked with the server every time. Without a header, browsers guess and can keep
//   the old page for days, which is how people got stuck on an old version.
routerUse((e) => {
  const path = e.request.url.path || "/";
  if (!path.startsWith("/api/") && !path.startsWith("/_/")) {
    e.response.header().set("Cache-Control", path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  }
  return e.next();
});
