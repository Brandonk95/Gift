// Follow digests: one email per follower with everything added since the last one.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
const SU = process.env.TEST_ADMIN_PASSWORD;
const MAIL_DIR = process.env.TEST_MAIL_DIR || "tests/.mail";
const sinkPath = join(MAIL_DIR, "sink.log");
async function req(method, path, { token, body, share } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.Authorization = token;
  if (share) h["X-Share-Token"] = share;
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, data: t ? JSON.parse(t) : null };
}
let fails = 0;
const check = (name, ok, extra) => { console.log(ok ? "ok  " : "FAIL", name, ok ? "" : JSON.stringify(extra ?? "")); if (!ok) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
  return { token: a.token, id: a.record.id, email };
}
const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: SU } })).data.token;
const digest = async () => {
  const before = readFileSync(sinkPath, "utf8").length;
  const r = await req("POST", "/api/crons/giftlist_follow_digest", { token: su });
  await wait(1500);
  return { status: r.status, mail: readFileSync(sinkPath, "utf8").slice(before) };
};

const owner = await user("Olivia"), owner2 = await user("Pat"), fan = await user("Fan"), lurker = await user("Lurker");
const mkList = async (o, title) => (await req("POST", "/api/collections/lists/records", { token: o.token, body: { owner: o.id, title, occasion: "birthday" } })).data;
const add = (o, list, name, extra = {}) => req("POST", "/api/collections/items/records", { token: o.token, body: { list: list.id, name, ...extra } });
const l1 = await mkList(owner, "Bday"), l2 = await mkList(owner2, "Xmas");
await add(owner, l1, "Old gift"); // before following: not included

// fan follows both lists; lurker has only opened l1 (follow without notify)
const f1 = (await req("POST", "/api/collections/follows/records", { token: fan.token, body: { user: fan.id, list: l1.id, token: l1.share_token } })).data;
const f2 = (await req("POST", "/api/collections/follows/records", { token: fan.token, body: { user: fan.id, list: l2.id, token: l2.share_token } })).data;
await req("POST", "/api/collections/follows/records", { token: lurker.token, body: { user: lurker.id, list: l1.id, token: l1.share_token } });
const hack = await req("PATCH", `/api/collections/follows/records/${f1.id}`, { token: fan.token, body: { notified_at: "2020-01-01 00:00:00.000Z" } });
check("can't move your own cursor", hack.status !== 200, hack);
const on1 = await req("PATCH", `/api/collections/follows/records/${f1.id}`, { token: fan.token, body: { notify: true } });
check("follow turns on and starts the clock", on1.status === 200 && on1.data.notify && on1.data.notified_at, on1.data);
await req("PATCH", `/api/collections/follows/records/${f2.id}`, { token: fan.token, body: { notify: true } });
await wait(1100);

const d0 = await digest();
check("nothing new → no email", d0.status === 204 && !d0.mail.includes(fan.email), d0.mail);

await add(owner, l1, "Red scarf");
await add(owner, l1, "Board game");
await add(owner, l1, "Already got it", { received: true });
await add(owner2, l2, "Coffee beans");
const d1 = await digest();
const fanMails = d1.mail.split("\n").filter((l) => l.includes(fan.email));
check("one combined email for the follower", fanMails.length === 1, d1.mail);
check("subject counts all new gifts", /3 new gifts on lists you follow/.test(fanMails[0] || ""), fanMails);
check("people who didn't follow get nothing", !d1.mail.includes(lurker.email), d1.mail);
const eml = readFileSync(join(MAIL_DIR, readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).sort().pop()), "utf8");
check("email lists the new gifts", /Red scarf/.test(eml) && /Board game/.test(eml) && /Coffee beans/.test(eml), "");
check("skips old and received gifts", !/Old gift/.test(eml) && !/Already got it/.test(eml), "");

const d2 = await digest();
check("never repeats gifts", !d2.mail.includes(fan.email), d2.mail);

// owner resets the share link: no more emails
await add(owner, l1, "After reset");
await req("PATCH", `/api/collections/lists/records/${l1.id}`, { token: owner.token, body: { share_token: "reset" + run + "abcdefghijk" } });
const d3 = await digest();
check("revoked link → no email", !d3.mail.includes(fan.email), d3.mail);

// unfollow
await req("PATCH", `/api/collections/follows/records/${f2.id}`, { token: fan.token, body: { notify: false } });
await add(owner2, l2, "Mug");
const d4 = await digest();
check("unfollowed → no email", !d4.mail.includes(fan.email), d4.mail);

// single list subject
await req("PATCH", `/api/collections/follows/records/${f2.id}`, { token: fan.token, body: { notify: true } });
await wait(1100);
await add(owner2, l2, "Socks");
const d5 = await digest();
check("single-list subject names the person", d5.mail.includes("Pat added 1 new gift to Xmas"), d5.mail);

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
