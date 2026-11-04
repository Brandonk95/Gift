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

function appUrl(app) {
  return (app.settings().meta.appURL || "http://localhost:8090").replace(/\/+$/, "");
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

// Send one of the optional notices to a user: an email (unless they turned that kind
// off, with an unsubscribe link and the one-click List-Unsubscribe headers) and a
// phone notification on each device that has them on. mail.push = { title, body, url }
// is the short version for phones; without it the subject is used.
// Returns true if it reached them either way. Throws if the email fails.
function sendUserMail(app, user, kind, mail) {
  const base = appUrl(app);
  let pushed = 0;
  try {
    const p = mail.push || {};
    pushed = require(`${__hooks}/lib/push.js`).notify(app, user, kind, {
      title: p.title || app.settings().meta.appName,
      body: p.body || mail.subject,
      url: p.url || base,
      tag: p.tag,
    });
  } catch (err) {
    console.log("[giftlist] push notification failed:", err);
  }
  if (!smtpEnabled(app) || !wantsEmail(user, kind)) return pushed > 0;
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

// Whether optional notices can reach anyone: email is set up, or someone has
// phone notifications on. Lets the crons skip their work on a server with neither.
function canNotify(app) {
  if (smtpEnabled(app)) return true;
  try {
    return require(`${__hooks}/lib/push.js`).anySubs(app);
  } catch (_) {
    return false;
  }
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
  canNotify,
  escapeHtml,
  appUrl,
  displayName,
  smtpEnabled,
  sendMail,
  isPublicHttpUrl,
  parseEmails,
};
