/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// "Follow" on a shared list: a nightly email with the gifts added since the last
// one (see lib/digest.js). Following starts the clock, so only gifts added after
// that are included.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  if (e.record.getBool("notify")) e.record.set("notified_at", require(`${__hooks}/lib/util.js`).pbDate(Date.now()));
  e.next();
}, "follows");

onRecordUpdateRequest((e) => {
  if (e.record.getBool("notify") && !e.record.original().getBool("notify")) {
    e.record.set("notified_at", require(`${__hooks}/lib/util.js`).pbDate(Date.now()));
  }
  e.next();
}, "follows");

// Runs hourly and sends digests (plus "coming up in a week" reminders) at DIGEST_HOUR
// (default 0 = midnight) in the server's time zone (set TZ, e.g. TZ=America/Denver).
// Nothing is ever sent twice, so running it again is harmless.
cronAdd("giftlist_follow_digest", "0 * * * *", () => {
  const hour = parseInt($os.getenv("DIGEST_HOUR") || "0", 10);
  if (new Date().getHours() !== (isNaN(hour) ? 0 : hour)) return;
  const digest = require(`${__hooks}/lib/digest.js`);
  try {
    const r = digest.sendDigests($app);
    if (r.emailed || r.failed) console.log(`[giftlist] follow digests: ${r.emailed} sent, ${r.failed} failed`);
  } catch (err) {
    console.log("[giftlist] follow digests failed:", err);
  }
  try {
    const r = digest.sendOccasionReminders($app);
    if (r.emailed || r.failed) console.log(`[giftlist] occasion reminders: ${r.emailed} sent, ${r.failed} failed`);
  } catch (err) {
    console.log("[giftlist] occasion reminders failed:", err);
  }
});
