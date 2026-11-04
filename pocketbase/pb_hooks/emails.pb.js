/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// One-click unsubscribe for the optional emails (see sendUserMail in lib/util.js).
// POST, so link scanners that open emails can't unsubscribe people by accident.
// Mail apps call it directly through the List-Unsubscribe-Post header; the link in
// the email opens /unsubscribe in the app, which calls it.
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/giftlist/unsubscribe", (e) => {
  const u = require(`${__hooks}/lib/util.js`);
  const q = e.request.url.query();
  const body = e.requestInfo().body || {};
  const id = String(q.get("u") || body.u || "");
  const kind = String(q.get("k") || body.k || "");
  const token = String(q.get("t") || body.t || "");
  const resubscribe = !!body.resubscribe;
  const invalid = "This unsubscribe link isn't valid anymore (it stops working if you change your password). Sign in and turn emails off under Account → Emails instead.";

  if (!u.EMAIL_KINDS[kind]) throw new BadRequestError(invalid);
  let user;
  try {
    user = e.app.findRecordById("users", id);
  } catch (_) {
    throw new BadRequestError(invalid);
  }
  if (!token || !$security.equal(token, u.unsubscribeToken(user, kind))) throw new BadRequestError(invalid);

  const prefs = u.emailPrefs(user);
  if (resubscribe) delete prefs[kind];
  else prefs[kind] = false;
  user.set("email_prefs", prefs);
  e.app.save(user);
  return e.json(200, { kind, label: u.EMAIL_KINDS[kind], subscribed: resubscribe });
});

