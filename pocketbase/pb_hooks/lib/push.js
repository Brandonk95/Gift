// Phone and desktop notifications (Web Push, see lib/webpush.js for the crypto).
//
// Each browser that turns notifications on stores a push_subs record. Sending posts an
// encrypted message to that browser's push service (Google, Apple or Mozilla), which
// delivers it even when the app is closed. Notification kinds match the optional
// emails (EMAIL_KINDS in util.js) and can be turned off separately in Account.

const KEY_NAME = "vapid";

function keys(app) {
  const wp = require(`${__hooks}/lib/webpush.js`);
  // only strings go in the shared store (each handler has its own JS engine)
  const cached = app.store().get("giftlist:vapid");
  if (cached) return { privateKey: wp.fromB64url(cached.d), publicKey: wp.fromB64url(cached.p), publicB64: cached.p };
  let rec = null;
  try {
    rec = app.findFirstRecordByFilter("secrets", "key = {:k}", { k: KEY_NAME });
  } catch (_) {}
  if (!rec) {
    const k = wp.generateKeys();
    rec = new Record(app.findCollectionByNameOrId("secrets"));
    rec.set("key", KEY_NAME);
    rec.set("value", JSON.stringify({ d: wp.b64url(k.privateKey), p: wp.b64url(k.publicKey) }));
    app.save(rec);
  }
  const v = JSON.parse(rec.getString("value"));
  app.store().set("giftlist:vapid", { d: v.d, p: v.p });
  return { privateKey: wp.fromB64url(v.d), publicKey: wp.fromB64url(v.p), publicB64: v.p };
}

function publicKey(app) {
  return keys(app).publicB64;
}

// Push services want a way to reach the server's admin. Apple refuses localhost.
function subject(app) {
  const env = ($os.getenv("VAPID_SUBJECT") || "").trim();
  if (env) return env;
  const sender = app.settings().meta.senderAddress;
  if (sender && sender.indexOf("@") > 0) return `mailto:${sender}`;
  const url = app.settings().meta.appURL || "";
  if (/^https:\/\//.test(url) && !/localhost/.test(url)) return url;
  return "mailto:admin@giftme.invalid";
}

// endpoints must be a real push service, except the one the tests point at
function endpointAllowed(endpoint) {
  const u = require(`${__hooks}/lib/util.js`);
  const test = ($os.getenv("PUSH_TEST_ENDPOINT") || "").trim();
  if (test && String(endpoint).indexOf(test) === 0) return true;
  return /^https:\/\//i.test(endpoint) && u.isPublicHttpUrl(endpoint);
}

function prefs(user) {
  try {
    return JSON.parse(user.getString("push_prefs") || "{}") || {};
  } catch (_) {
    return {};
  }
}

function wants(user, kind) {
  return !kind || prefs(user)[kind] !== false;
}

// one message to one browser. Returns the push service's status code (0 = no answer)
function sendOne(app, sub, message) {
  const wp = require(`${__hooks}/lib/webpush.js`);
  const endpoint = sub.getString("endpoint");
  if (!endpointAllowed(endpoint)) return 0;
  const k = keys(app);
  const body = wp.encrypt(wp.utf8(JSON.stringify(message)), sub.getString("p256dh"), sub.getString("auth"));
  try {
    const res = $http.send({
      url: endpoint,
      method: "POST",
      body,
      timeout: 10,
      headers: {
        TTL: "86400",
        Urgency: "normal",
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        Authorization: wp.vapidAuth(endpoint, subject(app), k, Math.floor(Date.now() / 1000)),
      },
    });
    // the browser unsubscribed or the app was uninstalled: forget it
    if (res.statusCode === 404 || res.statusCode === 410) app.delete(sub);
    else if (res.statusCode >= 400) console.log("[giftlist] push refused:", res.statusCode, toString(res.body).slice(0, 200));
    return res.statusCode;
  } catch (err) {
    console.log("[giftlist] push failed:", err);
    return 0;
  }
}

// message: { title, body, url, tag }. Returns how many devices accepted it.
function notify(app, user, kind, message) {
  if (!wants(user, kind)) return 0;
  const subs = app.findRecordsByFilter("push_subs", "user = {:u}", "", 20, 0, { u: user.id });
  let ok = 0;
  for (const s of subs) {
    const status = sendOne(app, s, {
      title: String(message.title || app.settings().meta.appName || "GiftMe").slice(0, 120),
      body: String(message.body || "").slice(0, 300),
      url: message.url || "/",
      tag: message.tag || kind || "",
    });
    if (status >= 200 && status < 300) ok++;
  }
  return ok;
}

function anySubs(app) {
  return app.findRecordsByFilter("push_subs", "id != ''", "", 1, 0).length > 0;
}

module.exports = { keys, publicKey, notify, sendOne, endpointAllowed, anySubs, wants, prefs };
