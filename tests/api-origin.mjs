// Email links use the address the person who caused the email was on: their
// browser's Origin, if it's a trusted address (listed in APP_URL, or on the local
// network). Untrusted addresses fall back to the default, so nobody can get your
// password-reset link sent to their own site.
//
// Optional: TEST_APP_URL = the test server's APP_URL, to also check a second listed
// address (e.g. "https://gifts.example.test,https://alt.example.test").
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const MAIL_DIR = process.env.TEST_MAIL_DIR || "tests/.mail";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
const started = Date.now();

async function req(method, path, { token, body, share, origin } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.Authorization = token;
  if (share) h["X-Share-Token"] = share;
  if (origin) h.Origin = origin;
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, data: t ? JSON.parse(t) : null };
}
let fails = 0;
const check = (name, ok, extra) => {
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : JSON.stringify(extra ?? ""));
  if (!ok) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// decoded text of the newest email to `email` (sent since the test began) that contains `marker`
async function mailFor(email, marker) {
  for (let i = 0; i < 15; i++) {
    await wait(400);
    const files = readdirSync(MAIL_DIR)
      .filter((f) => f.endsWith(".eml") && Number(f.split("-")[0]) >= started)
      .sort()
      .reverse();
    for (const f of files) {
      const raw = readFileSync(join(MAIL_DIR, f), "utf8");
      if (!raw.toLowerCase().includes(email.toLowerCase())) continue;
      const s = raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
      if (s.includes(marker)) return s;
    }
  }
  return "";
}
const user = async (name, origin) => {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name }, origin });
  const a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW }, origin })).data;
  return { email, token: a.token, id: a.record.id, record: a.record };
};

// ---- PocketBase's own emails -------------------------------------------
const LAN = "http://192.168.77.5:8090";
const vera = await user("Vera");
await req("POST", "/api/collections/users/request-verification", { body: { email: vera.email }, origin: LAN });
const verify = await mailFor(vera.email, "/verify/");
check("verification link uses the address it was requested from", verify.includes(`${LAN}/verify/`), verify.slice(0, 300));

const DEV = "http://172.20.0.9:5173";
await req("POST", "/api/collections/users/request-password-reset", { body: { email: vera.email }, origin: DEV });
const reset = await mailFor(vera.email, `${DEV}/reset-password/`);
check("password reset link too (any port, private network)", !!reset);

// (PocketBase sends each kind of email to an address at most once every 2 minutes,
// so each case below uses its own person)
const EVIL = "https://gifts-login.example.com";
const walt = await user("Walt");
const before = Date.now();
await req("POST", "/api/collections/users/request-password-reset", { body: { email: walt.email }, origin: EVIL });
let evilMail = "";
for (let i = 0; i < 15 && !evilMail; i++) {
  await wait(400);
  for (const f of readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml") && Number(f.split("-")[0]) >= before)) {
    const raw = readFileSync(join(MAIL_DIR, f), "utf8");
    if (raw.toLowerCase().includes(walt.email)) evilMail = raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
  }
}
check("an untrusted address is ignored (default address used instead)", !!evilMail && !evilMail.includes("gifts-login.example.com") && evilMail.includes("/reset-password/"), evilMail.slice(0, 200));

const listed = (process.env.TEST_APP_URL || "").split(",").map((s) => s.trim()).filter(Boolean);
if (listed.length > 1) {
  const alma = await user("Alma");
  await req("POST", "/api/collections/users/request-verification", { body: { email: alma.email }, origin: listed[1] });
  const alt = await mailFor(alma.email, `${listed[1]}/verify/`);
  check("a second address listed in APP_URL is used", !!alt);
}

// ---- the app's own emails ----------------------------------------------
const TS = "http://100.90.1.2:8090"; // a Tailscale address
const olive = await user("Olive");
const friend = await user("Finn");
const list = (await req("POST", "/api/collections/lists/records", { token: olive.token, body: { owner: olive.id, title: "Origins", occasion: "birthday" } })).data;
const item = (await req("POST", "/api/collections/items/records", { token: olive.token, body: { list: list.id, name: "Teapot" } })).data;

const shared = await req("POST", `/api/giftlist/lists/${list.id}/share`, { token: olive.token, body: { emails: [friend.email] }, origin: TS });
check("share invitation sends", shared.status === 200, shared);
const invite = await mailFor(friend.email, `/s/${list.share_token}`);
check("invitation links use the sharer's address", invite.includes(`${TS}/s/${list.share_token}`), invite.slice(0, 300));

// remembered address: Finn uses the app on a LAN address, then a reservation is
// made without one (a request with no Origin), so the email falls back to the address he last used
const HOME = "http://10.0.0.42:8090";
await req("GET", `/api/collections/users/records/${friend.id}`, { token: friend.token, origin: HOME });
const resv = await req("POST", "/api/collections/reservations/records", { token: friend.token, share: list.share_token, body: { item: item.id, user: friend.id } });
check("reservation made", resv.status === 200, resv);
const confirm = await mailFor(friend.email, `/s/${list.share_token}`);
check("confirmation links use the address the reserver last used", confirm.includes(`${HOME}/s/`), confirm.slice(0, 300));

const ASK = "http://192.168.1.77:8090";
const q = await req("POST", "/api/collections/questions/records", { token: friend.token, share: list.share_token, body: { list: list.id, question: "Which colour?" }, origin: ASK });
check("question saved", q.status === 200, q);
const asked = await mailFor(olive.email, "Which colour?");
check("question email links use the asker's address", asked.includes(`${ASK}/lists/${list.id}`), asked.slice(0, 300));

// ---- the remembered address stays server-side --------------------------
const me = (await req("GET", `/api/collections/users/records/${friend.id}`, { token: friend.token })).data;
check("people can't read their stored address", me && !("origin" in me), me);
await req("PATCH", `/api/collections/users/records/${friend.id}`, { token: friend.token, body: { origin: EVIL } });
if (process.env.TEST_ADMIN_EMAIL) {
  const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } })).data;
  const stored = (await req("GET", `/api/collections/users/records/${friend.id}`, { token: su.token })).data;
  check("or set it (it stays the last address they used)", stored.origin === ASK, stored.origin);
}

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
