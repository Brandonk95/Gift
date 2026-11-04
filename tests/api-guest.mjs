// Reserve without an account: name + email, a 6-digit emailed code, then reserve.
// Guests can later set a password.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
const MAIL_DIR = process.env.TEST_MAIL_DIR || "tests/.mail";

async function req(method, path, { token, body, share } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.Authorization = token;
  if (share) h["X-Share-Token"] = share;
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
// the sign-in code from the newest email to this address
async function codeFor(email) {
  for (let i = 0; i < 10; i++) {
    await wait(400);
    const files = readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).sort().reverse();
    for (const f of files) {
      const raw = readFileSync(join(MAIL_DIR, f), "utf8");
      if (!raw.includes(email)) continue;
      const s = raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");
      const m = /sign in to[^:]*:\s*(\d{6})(?!\d)/.exec(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
      if (m) return m[1];
    }
  }
  return "";
}

// an owner with a list to reserve from
const oEmail = `owner.${run}@example.test`;
await req("POST", "/api/collections/users/records", { body: { email: oEmail, password: PW, passwordConfirm: PW, name: "Olive" } });
const owner = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: oEmail, password: PW } })).data;
const list = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.record.id, title: "Bday", occasion: "birthday" } })).data;
const item = (await req("POST", "/api/collections/items/records", { token: owner.token, body: { list: list.id, name: "Kite" } })).data;

// guest sign-up
const gEmail = `Guest.${run}@Example.test`;
check("needs a name", (await req("POST", "/api/giftlist/guest", { body: { email: gEmail, name: "  " } })).status === 400);
check("needs a real email", (await req("POST", "/api/giftlist/guest", { body: { email: "nope", name: "Gus" } })).status === 400);
const g = await req("POST", "/api/giftlist/guest", { body: { email: gEmail, name: "Gus" } });
check("guest route answers ok", g.status === 200 && g.data.ok === true, g);
const again = await req("POST", "/api/giftlist/guest", { body: { email: gEmail, name: "Someone else" } });
check("asking again is harmless", again.status === 200, again);
const forOwner = await req("POST", "/api/giftlist/guest", { body: { email: oEmail, name: "Impostor" } });
check("existing account: same answer, nothing revealed", forOwner.status === 200 && JSON.stringify(forOwner.data) === JSON.stringify(g.data), forOwner);
const ownerAfter = (await req("GET", `/api/collections/users/records/${owner.record.id}`, { token: owner.token })).data;
check("existing account isn't changed", ownerAfter.name === "Olive" && !ownerAfter.guest, ownerAfter);

const otp = await req("POST", "/api/collections/users/request-otp", { body: { email: gEmail.toLowerCase() } });
check("code requested", otp.status === 200 && !!otp.data.otpId, otp);
const code = await codeFor(gEmail.toLowerCase());
check("code arrives by email", /^\d{6}$/.test(code));
const wrong = await req("POST", "/api/collections/users/auth-with-otp", { body: { otpId: otp.data.otpId, password: code === "000000" ? "111111" : "000000" } });
check("wrong code refused", wrong.status === 400, wrong);
const auth = await req("POST", "/api/collections/users/auth-with-otp", { body: { otpId: otp.data.otpId, password: code } });
check("right code signs in", auth.status === 200 && !!auth.data.token, auth);
const guest = auth.data?.record || {};
check("account is a guest named Gus, email verified", guest.guest === true && guest.name === "Gus" && guest.verified === true, guest);

const res = await req("POST", "/api/collections/reservations/records", { token: auth.data.token, share: list.share_token, body: { item: item.id, user: guest.id } });
check("guest reserves", res.status === 200 && res.data.reserver_name === "Gus", res);

// account flag is locked
const flip = await req("PATCH", `/api/collections/users/records/${owner.record.id}`, { token: owner.token, body: { guest: true } });
check("can't make yourself a guest", flip.status >= 400, flip);
const signupGuest = await req("POST", "/api/collections/users/records", { body: { email: `x.${run}@example.test`, password: PW, passwordConfirm: PW, guest: true } });
check("can't sign up as a guest", signupGuest.status === 400, signupGuest);

// setting a password
const notGuest = await req("POST", "/api/giftlist/account/password", { token: owner.token, body: { password: "abcdefgh1", passwordConfirm: "abcdefgh1" } });
check("normal accounts can't skip the current password", notGuest.status === 400, notGuest);
check("short password refused", (await req("POST", "/api/giftlist/account/password", { token: auth.data.token, body: { password: "short", passwordConfirm: "short" } })).status === 400);
check("mismatch refused", (await req("POST", "/api/giftlist/account/password", { token: auth.data.token, body: { password: PW, passwordConfirm: PW + "x" } })).status === 400);
check("needs sign-in", (await req("POST", "/api/giftlist/account/password", { body: { password: PW, passwordConfirm: PW } })).status === 401);
const set = await req("POST", "/api/giftlist/account/password", { token: auth.data.token, body: { password: PW, passwordConfirm: PW } });
check("guest sets a password and gets a fresh session", set.status === 200 && !!set.data.token && set.data.record.guest === false, set);
const login = await req("POST", "/api/collections/users/auth-with-password", { body: { identity: gEmail.toLowerCase(), password: PW } });
check("then logs in with it", login.status === 200, login);
const twice = await req("POST", "/api/giftlist/account/password", { token: set.data.token, body: { password: PW + "2", passwordConfirm: PW + "2" } });
check("only once", twice.status === 400, twice);

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
