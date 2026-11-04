// Shared helpers for the hooks. Each hook handler runs in its own isolated
// context, so handlers must `require()` this file instead of using top-level
// functions from main.pb.js.

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Which address links in emails use.
//
// Links go to the address the person who caused the email was using (their
// browser's Origin), so someone on http://192.168.1.20:8090 gets links that work
// there, and someone on https://gifts.example.com gets those. Only trusted
// addresses are used, otherwise anyone could request a password reset for you
// with a fake address and receive your reset link:
//   - every address listed in APP_URL (comma-separated; the first is the default)
//   - addresses on your own network: localhost, *.local, private and Tailscale
//     IPs (10.x, 172.16-31.x, 192.168.x, 100.64-127.x), which strangers can't host
// Anything else falls back to the default address.
// ---------------------------------------------------------------------------
function defaultUrl(app) {
  return (app.settings().meta.appURL || "http://localhost:8090").replace(/\/+$/, "");
}

// APP_URL entries, without trailing slashes
function configuredUrls() {
  return ($os.getenv("APP_URL") || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => /^https?:\/\//i.test(s));
}

// "https://Gifts.Example.com:443/path" -> "https://gifts.example.com:443"
function originOf(s) {
  const m = String(s || "").trim().match(/^(https?):\/\/([^\/?#\s@]+)/i);
  return m ? `${m[1]}://${m[2]}`.toLowerCase() : "";
}

function isLocalHost(hostPort) {
  let host = hostPort.replace(/:\d+$/, "");
  if (host[0] === "[") return host === "[::1]";
  if (host === "localhost" || /\.(localhost|local)$/.test(host)) return true;
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ip) return false;
  const [a, b] = [Number(ip[1]), Number(ip[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

// The trusted address matching `s`, or "" if it isn't one
function trustedUrl(s) {
  const o = originOf(s);
  if (!o) return "";
  for (const url of configuredUrls()) if (originOf(url) === o) return url;
  return isLocalHost(o.split("://")[1]) ? o : "";
}

// The trusted address a request came from (its Origin, else its Referer), or ""
function requestUrl(e) {
  let origin = "", referer = "";
  try {
    if (e.request) {
      origin = e.request.header.get("Origin");
      referer = e.request.header.get("Referer");
    } else {
      // PocketBase's own auth events expose headers through requestInfo()
      const h = e.requestInfo().headers || {};
      origin = h.origin || "";
      referer = h.referer || "";
    }
  } catch (_) {
    return "";
  }
  return trustedUrl(origin) || trustedUrl(referer);
}

// Base address for links. `ctx` says whose address to use:
//   a request event   -> the address that request came from
//   a users record    -> the address that person last used the app on
//   a string          -> that address, if trusted
// and the default address otherwise.
function appUrl(app, ctx) {
  let url = "";
  try {
    if (typeof ctx === "string") url = trustedUrl(ctx);
    else if (ctx && (ctx.request || typeof ctx.requestInfo === "function")) url = requestUrl(ctx);
    else if (ctx && typeof ctx.getString === "function") url = trustedUrl(ctx.getString("origin"));
  } catch (_) {
    url = "";
  }
  return url || defaultUrl(app);
}

// PocketBase's own emails (verification, password reset, sign-in codes, email
// change, new-login alerts) are built from the default address. Requests that
// trigger them note where they came from here; the mailer hooks then swap the
// address in the finished message. Notes expire after 15 minutes.
const MAIL_NOTE_TTL = 15 * 60 * 1000;

function noteMailOrigin(e, record, extraEmail) {
  const url = requestUrl(e);
  if (!url) return;
  const note = { url, at: Date.now() };
  const keys = [];
  if (record) {
    if (record.id) keys.push(`id:${record.id}`);
    if (record.email()) keys.push(`email:${record.email().toLowerCase()}`);
  }
  if (extraEmail) keys.push(`email:${String(extraEmail).toLowerCase()}`);
  for (const k of keys) $app.store().set(`giftlist.mailorigin.${k}`, note);
}

function retargetAuthMail(e) {
  try {
    const store = $app.store();
    const keys = [];
    if (e.record) {
      keys.push(`id:${e.record.id}`, `email:${e.record.email().toLowerCase()}`);
    }
    for (const to of e.message.to || []) if (to && to.address) keys.push(`email:${String(to.address).toLowerCase()}`);
    let url = "";
    for (const k of keys) {
      const note = store.get(`giftlist.mailorigin.${k}`);
      if (note && note.url && Date.now() - note.at < MAIL_NOTE_TTL) {
        url = note.url;
        break;
      }
    }
    if (!url && e.record) url = trustedUrl(e.record.getString("origin"));
    const from = defaultUrl(e.app);
    if (!url || url === from) return;
    e.message.html = String(e.message.html || "").split(from).join(url);
    e.message.text = String(e.message.text || "").split(from).join(url);
  } catch (err) {
    console.log("[giftlist] could not adjust email links:", err);
  }
}

function displayName(record) {
  if (!record) return "";
  const name = record.getString("name");
  if (name) return name;
  return record.getString("email").split("@")[0];
}

function smtpEnabled(app) {
  return !!app.settings().smtp.enabled;
}

function sendMail(app, to, subject, html, text, headers) {
  const meta = app.settings().meta;
  const message = new MailerMessage({
    from: { address: meta.senderAddress, name: meta.senderName || meta.appName },
    to: to.map((address) => ({ address })),
    subject,
    html,
    text: text || "",
    headers: headers || {},
  });
  app.newMailClient().send(message);
}

// Optional emails people can turn off (Account → Emails, or the link in each email)
const EMAIL_KINDS = {
  reservations: "reservation confirmations",
  reminders: "reservation reminders",
  digest: "new gifts on lists you follow",
  occasions: "upcoming occasion reminders",
  questions: "questions and answers about gifts",
  prices: "price drop alerts",
  santa: "Secret Santa messages and updates",
};

function emailPrefs(user) {
  try {
    return JSON.parse(user.getString("email_prefs") || "{}") || {};
  } catch (_) {
    return {};
  }
}

function wantsEmail(user, kind) {
  return emailPrefs(user)[kind] !== false;
}

// Signed with the user's token key, so links stop working if their password changes
function unsubscribeToken(user, kind) {
  return $security.hs256(`${user.id}:${kind}`, user.tokenKey() + ":unsubscribe");
}

function unsubscribeQuery(user, kind) {
  return `u=${encodeURIComponent(user.id)}&k=${encodeURIComponent(kind)}&t=${unsubscribeToken(user, kind)}`;
}

// Send one of the optional emails to a user: skips people who turned that kind off,
// and adds an unsubscribe link plus the one-click List-Unsubscribe headers.
// `base` is the address the email's links use (see appUrl); defaults to the
// one the recipient last used.
function sendUserMail(app, user, kind, mail, base) {
  if (!wantsEmail(user, kind)) return false;
  base = base || appUrl(app, user);
  const q = unsubscribeQuery(user, kind);
  const link = `${base}/unsubscribe?${q}`;
  const footer =
    `Don't want ${EMAIL_KINDS[kind]}? <a href="${escapeHtml(link)}" style="color:#71717a;text-decoration:underline">Unsubscribe</a>` +
    ` · <a href="${escapeHtml(base)}/account#emails" style="color:#71717a;text-decoration:underline">Email settings</a><br>`;
  sendMail(app, [user.email()], mail.subject, mail.html.replace("<!--giftlist-unsub-->", footer), `${mail.text}
Unsubscribe from ${EMAIL_KINDS[kind]}: ${link}
`, {
    "List-Unsubscribe": `<${base}/api/giftlist/unsubscribe?${q}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  return true;
}

// Very small guard against fetching internal addresses from the link preview.
function isPublicHttpUrl(raw) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(raw || "").trim());
  if (!m) return false;
  const host = m[1].toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host.indexOf(":") >= 0 || host.startsWith("[")) return false; // ipv6 literals
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (ip) {
    const a = +ip[1], b = +ip[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  if (!host.includes(".")) return false;
  return true;
}

// "a@x.com, b@y.com" or ["a@x.com"] → unique lowercase addresses; throws a friendly error on typos
function parseEmails(input, max) {
  const raw = Array.isArray(input) ? input : String(input || "").split(/[\s,;]+/);
  const emails = [];
  for (const r of raw) {
    const addr = String(r || "").trim().toLowerCase();
    if (!addr) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      throw new BadRequestError(`“${addr}” isn't a valid email address. Check it for typos — it should look like name@example.com. Separate multiple addresses with commas or spaces.`);
    }
    if (emails.indexOf(addr) < 0) emails.push(addr);
  }
  if (emails.length === 0) throw new BadRequestError("Enter at least one email address to send the invitation to.");
  if (emails.length > max) throw new BadRequestError(`You entered ${emails.length} addresses, but you can email up to ${max} people at a time. Send the rest in another batch.`);
  return emails;
}

// Reservations are held this long (RESERVATION_DAYS, default 7), and renewing starts the clock again.
const RESERVATION_DAYS = Math.max(1, parseInt($os.getenv("RESERVATION_DAYS") || "7", 10) || 7);

// PocketBase's date format: "2026-11-10 19:00:00.000Z"
function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function reservationExpiry() {
  return pbDate(Date.now() + RESERVATION_DAYS * 864e5);
}

// Shopify shops: swap in the exact product data from /products/<handle>.js
// (see lib/scrape.js). Leaves `d` as it was if the shop doesn't answer.
function withShopify(scrape, d, url, html) {
  const jsonUrl = scrape.shopifyJsonUrl(url, html);
  if (!jsonUrl || !isPublicHttpUrl(jsonUrl)) return d;
  try {
    const res = $http.send({ url: jsonUrl, method: "GET", timeout: 8, headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; GiftList)" } });
    if (res.statusCode !== 200) return d;
    return scrape.applyShopify(d, JSON.parse(toString(res.body, 2 * 1024 * 1024)), url, html);
  } catch (_) {
    return d;
  }
}

module.exports = {
  withShopify,
  RESERVATION_DAYS,
  pbDate,
  reservationExpiry,
  EMAIL_KINDS,
  emailPrefs,
  wantsEmail,
  unsubscribeToken,
  sendUserMail,
  escapeHtml,
  appUrl,
  defaultUrl,
  configuredUrls,
  trustedUrl,
  requestUrl,
  noteMailOrigin,
  retargetAuthMail,
  displayName,
  smtpEnabled,
  sendMail,
  isPublicHttpUrl,
  parseEmails,
};
