/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Reservations last a week (RESERVATION_DAYS). The person who reserved a gift can renew it (from the
// list or their shopping list), gets a reminder a day before it runs out, and
// expired reservations are released so someone else can get the gift. Gifts marked
// as bought don't expire.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/lib/util.js`);
  // an expired reservation that hasn't been cleaned up yet shouldn't block the gift
  const item = e.record.getString("item");
  if (item) {
    const stale = e.app.findRecordsByFilter("reservations", "item = {:item} && purchased = false && expires != '' && expires < {:now}", "", 0, 0, {
      item,
      now: u.pbDate(Date.now()),
    });
    for (const r of stale) e.app.delete(r);
  }
  e.record.set("expires", u.reservationExpiry());
  e.record.set("reminded", false);
  e.next();
}, "reservations");

// Un-marking a gift as bought starts a fresh week
onRecordUpdateRequest((e) => {
  if (e.record.original().getBool("purchased") && !e.record.getBool("purchased")) {
    e.record.set("expires", require(`${__hooks}/lib/util.js`).reservationExpiry());
    e.record.set("reminded", false);
  }
  e.next();
}, "reservations");

// Keep a reservation for another RESERVATION_DAYS
routerAdd(
  "POST",
  "/api/giftlist/reservations/{id}/renew",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    let r;
    try {
      r = e.app.findRecordById("reservations", e.request.pathValue("id"));
    } catch (_) {
      r = null;
    }
    if (!r || r.getString("user") !== e.auth.id) {
      throw new NotFoundError("This reservation has already ended, so the gift was released. Open the list again and reserve it if it's still available.");
    }
    if (!r.getBool("purchased")) {
      r.set("expires", u.reservationExpiry());
      r.set("reminded", false);
      e.app.save(r);
    }
    return e.json(200, r);
  },
  $apis.requireAuth()
);

// Every 15 minutes: remind people whose reservation ends within a day, and release expired ones
cronAdd("giftlist_reservations", "*/15 * * * *", () => {
  const u = require(`${__hooks}/lib/util.js`);
  const now = u.pbDate(Date.now());

  try {
    const expired = $app.findRecordsByFilter("reservations", "purchased = false && expires != '' && expires < {:now}", "", 500, 0, { now });
    const mails = require(`${__hooks}/lib/mails.js`);
    for (const r of expired) {
      // gather what the "released" email needs before the record goes away
      let note = null;
      if (u.smtpEnabled($app)) {
        try {
          const user = $app.findRecordById("users", r.getString("user"));
          const item = $app.findRecordById("items", r.getString("item"));
          const list = $app.findRecordById("lists", item.getString("list"));
          note = { user, mail: mails.reservationReleasedEmail({ appName: $app.settings().meta.appName, appUrl: u.appUrl($app, user), list, item }) };
        } catch (_) {}
      }
      $app.delete(r);
      if (note) {
        try {
          u.sendUserMail($app, note.user, "reminders", note.mail);
        } catch (err) {
          console.log("[giftlist] released email failed:", err);
        }
      }
    }
    if (expired.length) console.log(`[giftlist] released ${expired.length} expired reservation(s)`);
  } catch (err) {
    console.log("[giftlist] releasing expired reservations failed:", err);
  }

  if (!u.smtpEnabled($app)) return;
  const soon = u.pbDate(Date.now() + 864e5);
  let due = [];
  try {
    due = $app.findRecordsByFilter("reservations", "purchased = false && reminded = false && expires != '' && expires >= {:now} && expires < {:soon}", "", 200, 0, { now, soon });
  } catch (err) {
    console.log("[giftlist] finding reservations to remind failed:", err);
  }
  for (const r of due) {
    // mark first so a mail failure can't cause a flood of retries
    r.set("reminded", true);
    $app.save(r);
    try {
      const user = $app.findRecordById("users", r.getString("user"));
      const item = $app.findRecordById("items", r.getString("item"));
      const list = $app.findRecordById("lists", item.getString("list"));
      const mail = require(`${__hooks}/lib/mails.js`).reservationReminderEmail({
        appName: $app.settings().meta.appName,
        appUrl: u.appUrl($app, user),
        currency: list.getString("currency") || ($os.getenv("APP_CURRENCY") || "USD").trim(),
        list,
        item,
        expires: r.getString("expires"),
      });
      u.sendUserMail($app, user, "reminders", mail);
    } catch (err) {
      console.log("[giftlist] reservation reminder failed:", err);
    }
  }
});
