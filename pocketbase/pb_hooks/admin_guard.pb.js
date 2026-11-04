/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Brute-force protection for the admin dashboard (/admin, /_/).
//
// Wrong admin passwords lock out the address they came from: 5 misses in 15
// minutes locks it for 15 minutes, and each lockout after that doubles (up to a
// day). If many addresses miss at once (a spread-out attack), admin password
// sign-in pauses for everyone for 15 minutes. A correct password clears the
// address's misses. Counts live in memory, so restarting the server clears them.
//
// Behind a reverse proxy, set Settings → Application → Trusted proxy (see
// DEPLOY.md), or every visitor looks like the proxy's address.
// ---------------------------------------------------------------------------

onRecordAuthWithPasswordRequest((e) => {
  const g = require(`${__hooks}/lib/admin_guard.js`);
  const ip = e.realIP() || "unknown";
  const now = Date.now();
  const wait = g.lockedFor(e.app, ip, now);
  if (wait > 0) {
    throw new TooManyRequestsError(`Too many wrong passwords. Try again in ${g.humanWait(wait)}.`);
  }
  try {
    e.next();
  } catch (err) {
    // only a wrong email or password counts as a miss, not e.g. a malformed request
    if (String(err).indexOf("Failed to authenticate") !== -1) g.recordMiss(e.app, ip, now, e.identity);
    throw err;
  }
  g.recordSuccess(e.app, ip);
}, "_superusers");
