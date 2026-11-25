/// <reference path="../pb_data/types.d.ts" />

// Refuses the API of features switched off on this server (see lib/features.js).
// The admin dashboard (superusers) can still see their data.
routerUse((e) => {
  const path = e.request.url.path || "";
  if (path.startsWith("/api/")) {
    const off = require(`${__hooks}/lib/features.js`).blockedBy(path);
    if (off && !(e.auth && e.auth.isSuperuser())) {
      const name = off === "santa" ? "Secret Santa" : "Groups";
      return e.json(404, { status: 404, message: `${name} is turned off on this server.`, data: {} });
    }
  }
  return e.next();
});
