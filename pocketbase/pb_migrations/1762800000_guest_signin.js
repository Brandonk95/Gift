/// <reference path="../pb_data/types.d.ts" />

// Reserve without an account: friends give their name and email, get a 6-digit code
// by email and are signed in (PocketBase's one-time-password sign-in). Accounts made
// this way are marked `guest` until they set a password (see guest.pb.js).
const LOCK = "@request.body.guest:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "guest" }));
  users.otp.enabled = true;
  users.otp.duration = 600; // 10 minutes
  users.otp.length = 6;
  // only the server sets guest (rules come through as Go values, so make them plain strings)
  const create = users.createRule == null ? null : String(users.createRule);
  const update = users.updateRule == null ? null : String(users.updateRule);
  if (create !== null) users.createRule = create ? `(${create}) && ${LOCK}` : LOCK;
  if (update) users.updateRule = `(${update}) && ${LOCK}`;
  app.save(users);

  // the guest sign-up route gets its own, tighter rate limit
  const settings = app.settings();
  const rules = [];
  for (const r of settings.rateLimits.rules) rules.push({ label: r.label, audience: r.audience, duration: r.duration, maxRequests: r.maxRequests });
  if (!rules.some((r) => r.label === "/api/giftlist/guest")) {
    rules.unshift({ label: "/api/giftlist/guest", audience: "", duration: 60, maxRequests: 5 });
    unmarshal({ rateLimits: { rules } }, settings);
    app.save(settings);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("guest");
  users.otp.enabled = false;
  const strip = (rule) => {
    if (rule == null) return rule;
    rule = String(rule);
    if (rule === LOCK) return "";
    return rule.endsWith(` && ${LOCK}`) ? rule.slice(1, -(` && ${LOCK}`.length + 1)) : rule;
  };
  users.createRule = strip(users.createRule);
  users.updateRule = strip(users.updateRule);
  app.save(users);
});
