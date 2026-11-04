/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Phone notifications (see lib/push.js).
// ---------------------------------------------------------------------------

// the key browsers need to subscribe
routerAdd("GET", "/api/giftlist/push/key", (e) => {
  return e.json(200, { publicKey: require(`${__hooks}/lib/push.js`).publicKey(e.app) });
});

onRecordCreateRequest((e) => {
  const push = require(`${__hooks}/lib/push.js`);
  const endpoint = e.record.getString("endpoint");
  if (!push.endpointAllowed(endpoint)) {
    throw new BadRequestError("This browser gave an address that isn't a known notification service, so notifications can't be turned on here.");
  }
  // the same browser signing in to another account: move it over
  for (const old of e.app.findRecordsByFilter("push_subs", "endpoint = {:ep}", "", 0, 0, { ep: endpoint })) e.app.delete(old);
  // keep it tidy: at most 10 devices per person (oldest go first)
  const mine = e.app.findRecordsByFilter("push_subs", "user = {:u}", "-created", 0, 0, { u: e.record.getString("user") });
  for (const old of mine.slice(9)) e.app.delete(old);
  e.next();
}, "push_subs");

routerAdd(
  "POST",
  "/api/giftlist/push/test",
  (e) => {
    const push = require(`${__hooks}/lib/push.js`);
    const u = require(`${__hooks}/lib/util.js`);
    const subs = e.app.findRecordsByFilter("push_subs", "user = {:u}", "", 20, 0, { u: e.auth.id });
    if (!subs.length) throw new BadRequestError("Notifications aren't on for any of your devices yet. Turn them on first.");
    let sent = 0;
    for (const s of subs) {
      const status = push.sendOne(e.app, s, { title: "Notifications are on 🎁", body: "This is how GiftMe will tell you about new gifts and reservations.", url: `${u.appUrl(e.app)}/account#notifications`, tag: "test" });
      if (status >= 200 && status < 300) sent++;
    }
    return e.json(200, { sent, devices: subs.length });
  },
  $apis.requireAuth()
);
