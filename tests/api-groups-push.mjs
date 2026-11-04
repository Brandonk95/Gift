// Family groups (lists shared through group membership) and phone notifications.
// Push needs the test server started with PUSH_TEST_ENDPOINT=http://host.docker.internal:2526/
// (or http://127.0.0.1:2526/ when PocketBase runs on this machine): this file listens
// there as a stand-in push service and decrypts what arrives like a browser would.
import crypto from "node:crypto";
import http from "node:http";
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const PUSH_PREFIX = process.env.PUSH_TEST_ENDPOINT || "http://host.docker.internal:2526/";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
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
const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } })).data.token;
const mkList = async (o, title, extra = {}) => (await req("POST", "/api/collections/lists/records", { token: o.token, body: { owner: o.id, title, occasion: "birthday", ...extra } })).data;
const followsOf = async (o) => (await req("GET", `/api/collections/follows/records?perPage=200&filter=${encodeURIComponent(`user="${o.id}"`)}`, { token: o.token })).data.items;
const follows = async (o, list) => (await followsOf(o)).find((f) => f.list === list.id);

// ------------------------------------------------------------------ groups
const ann = await user("Ann"), ben = await user("Ben"), cat = await user("Cat"), dan = await user("Dan"), eve = await user("Eve");
const la = await mkList(ann, "Ann bday"), board = await mkList(ann, "Ideas", { private: true }), lb = await mkList(ben, "Ben xmas"), lc = await mkList(cat, "Cat wedding");
const ld = await mkList(dan, "Dan stuff");

const g = (await req("POST", "/api/collections/groups/records", { token: ann.token, body: { owner: ann.id, name: "Family", emoji: "🏡" } })).data;
check("group created with an invite link", g?.id && g.invite_token?.length === 24, g);
const forged = await req("POST", "/api/collections/groups/records", { token: ann.token, body: { owner: ann.id, name: "X", invite_token: "aaaaaaaaaaaaaaaaaaaaaaaa" } });
check("can't pick your own invite token", forged.status === 400, forged);

const info = await req("GET", `/api/giftlist/groups/invite/${g.invite_token}`);
check("invite link says what you're joining (signed out)", info.status === 200 && info.data.name === "Family" && info.data.owner_name === "Ann" && info.data.members === 1, info.data);
check("bad invite link is a 404", (await req("GET", "/api/giftlist/groups/invite/nope")).status === 404);
check("joining needs an account", (await req("POST", "/api/giftlist/groups/join", { body: { token: g.invite_token } })).status === 401);

const j1 = await req("POST", "/api/giftlist/groups/join", { token: ben.token, body: { token: g.invite_token } });
check("Ben joins", j1.status === 200 && j1.data.joined && j1.data.id === g.id, j1);
check("joining twice is harmless", (await req("POST", "/api/giftlist/groups/join", { token: ben.token, body: { token: g.invite_token } })).data.joined === false);
const fa = await follows(ben, la);
check("Ben now sees Ann's list", fa && fa.via_group === g.id && fa.token === la.share_token && fa.notify, fa);
check("…and can open it with that link", (await req("GET", `/api/collections/lists/records/${la.id}`, { token: ben.token, share: fa.token })).status === 200);
check("Ann sees Ben's list", (await follows(ann, lb))?.via_group === g.id);
check("private ideas boards stay private", !(await follows(ben, board)));

await req("POST", "/api/giftlist/groups/join", { token: cat.token, body: { token: g.invite_token } });
check("a third member connects with both", (await follows(cat, la)) && (await follows(cat, lb)) && (await follows(ann, lc)) && (await follows(ben, lc)));
check("outsiders see nothing", !(await follows(eve, la)));

const members = await req("GET", `/api/collections/group_members/records?filter=${encodeURIComponent(`group="${g.id}"`)}`, { token: cat.token });
check("members see who's in the group", members.data?.items?.length === 3 && members.data.items.some((m) => m.name === "Ben"), members.data);
check("outsiders can't see the group", (await req("GET", `/api/collections/groups/records/${g.id}`, { token: eve.token })).status === 404);
check("outsiders can't see its members", (await req("GET", `/api/collections/group_members/records?filter=${encodeURIComponent(`group="${g.id}"`)}`, { token: eve.token })).data.items.length === 0);
const sneak = await req("POST", "/api/collections/group_members/records", { token: eve.token, body: { group: g.id, user: eve.id } });
check("can't add yourself without the link", sneak.status >= 400, sneak);

const lb2 = await mkList(ben, "Ben new");
check("a new list reaches the group right away", (await follows(ann, lb2)) && (await follows(cat, lb2)));

await req("PATCH", `/api/collections/lists/records/${la.id}`, { token: ann.token, body: { private: true } });
check("making a list private takes it away", !(await follows(ben, la)));
await req("PATCH", `/api/collections/lists/records/${la.id}`, { token: ann.token, body: { private: false } });
check("…and making it public brings it back", !!(await follows(ben, la)));

const newTok = "t" + run + "abcdefghijklmnop".slice(0, 20 - run.length);
const reset = await req("PATCH", `/api/collections/lists/records/${la.id}`, { token: ann.token, body: { share_token: newTok } });
const fa2 = await follows(ben, la);
check("a new share link keeps group members in", reset.status === 200 && fa2?.token === reset.data.share_token, { reset, fa2 });

const fakeVia = await req("POST", "/api/collections/follows/records", { token: eve.token, body: { user: eve.id, list: la.id, token: "x", via_group: g.id } });
check("can't mark a follow as from a group", fakeVia.status === 400, fakeVia);

// Dan already followed Ann's list himself; joining and leaving must leave that alone
const manual = await req("POST", "/api/collections/follows/records", { token: dan.token, body: { user: dan.id, list: la.id, token: reset.data.share_token } });
await req("POST", "/api/giftlist/groups/join", { token: dan.token, body: { token: g.invite_token } });
check("Dan's own follow isn't replaced", (await follows(dan, la))?.id === manual.data.id && !(await follows(dan, la)).via_group);
const danMember = (await req("GET", `/api/collections/group_members/records?filter=${encodeURIComponent(`user="${dan.id}"`)}`, { token: dan.token })).data.items[0];
check("Dan leaves", (await req("DELETE", `/api/collections/group_members/records/${danMember.id}`, { token: dan.token })).status === 204);
check("…his own follow stays", (await follows(dan, la))?.id === manual.data.id);
check("…the group's ones go", !(await follows(dan, lb)) && !(await follows(ann, ld)));

// a second group keeps Ann and Cat connected when Cat leaves Family
const g2 = (await req("POST", "/api/collections/groups/records", { token: cat.token, body: { owner: cat.id, name: "Book club" } })).data;
await req("POST", "/api/giftlist/groups/join", { token: ann.token, body: { token: g2.invite_token } });
const catMember = (await req("GET", `/api/collections/group_members/records?filter=${encodeURIComponent(`user="${cat.id}" && group="${g.id}"`)}`, { token: cat.token })).data.items[0];
const removed = await req("DELETE", `/api/collections/group_members/records/${catMember.id}`, { token: ann.token });
check("the owner can remove someone", removed.status === 204, removed);
check("Cat and Ben are no longer connected", !(await follows(cat, lb)) && !(await follows(ben, lc)));
check("Cat and Ann still are, through the other group", (await follows(cat, la))?.via_group === g2.id && (await follows(ann, lc))?.via_group === g2.id);

const annMember = (await req("GET", `/api/collections/group_members/records?filter=${encodeURIComponent(`user="${ann.id}" && group="${g.id}"`)}`, { token: ann.token })).data.items[0];
check("the owner can't leave their own group", (await req("DELETE", `/api/collections/group_members/records/${annMember.id}`, { token: ann.token })).status === 400);
check("members can't rename the group", (await req("PATCH", `/api/collections/groups/records/${g.id}`, { token: ben.token, body: { name: "Mine" } })).status === 404);
const oldInvite = g.invite_token;
const ri = await req("POST", `/api/giftlist/groups/${g.id}/reset-invite`, { token: ann.token });
check("new invite link", ri.status === 200 && ri.data.invite_token !== oldInvite);
check("old invite link stops working", (await req("POST", "/api/giftlist/groups/join", { token: eve.token, body: { token: oldInvite } })).status === 404);
check("only the owner can reset it", (await req("POST", `/api/giftlist/groups/${g.id}/reset-invite`, { token: ben.token })).status === 403);

check("deleting the group", (await req("DELETE", `/api/collections/groups/records/${g.id}`, { token: ann.token })).status === 204);
check("…disconnects its members", !(await follows(ben, la)) && !(await follows(ann, lb)));
check("…but not people another group connects", (await follows(cat, la))?.via_group === g2.id);

// ------------------------------------------------------------------ push
const received = [];
let answer = 201;
const sink = http.createServer((rq, rs) => {
  const chunks = [];
  rq.on("data", (c) => chunks.push(c));
  rq.on("end", () => {
    received.push({ path: rq.url, headers: rq.headers, body: Buffer.concat(chunks) });
    rs.writeHead(answer);
    rs.end();
  });
}).listen(2526, "0.0.0.0");
await new Promise((r) => sink.once("listening", r));

function browser() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, auth: crypto.randomBytes(16) };
}
function decrypt(b, body) {
  const salt = body.subarray(0, 16), idlen = body[20], key = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), b.ecdh.getPublicKey(), key]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", b.ecdh.computeSecret(key), b.auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(plain.subarray(0, -1).toString());
}
const subscribe = (o, b, path) =>
  req("POST", "/api/collections/push_subs/records", {
    token: o.token,
    body: { user: o.id, endpoint: PUSH_PREFIX + path, p256dh: b.ecdh.getPublicKey().toString("base64url"), auth: b.auth.toString("base64url"), label: "Test phone" },
  });

const { publicKey } = (await req("GET", "/api/giftlist/push/key")).data;
check("server has a push key", Buffer.from(publicKey, "base64url").length === 65);
check("again the same key", (await req("GET", "/api/giftlist/push/key")).data.publicKey === publicKey);

check("test needs a device first", (await req("POST", "/api/giftlist/push/test", { token: eve.token })).status === 400);
const bad = await req("POST", "/api/collections/push_subs/records", { token: eve.token, body: { user: eve.id, endpoint: "http://192.168.1.5/x", p256dh: "a", auth: "b" } });
check("only real push services are accepted", bad.status === 400, bad);

const phone = browser();
const sub = await subscribe(eve, phone, `eve-${run}`);
check("turn on notifications", sub.status === 200, sub);
const t = await req("POST", "/api/giftlist/push/test", { token: eve.token });
check("test notification sent", t.status === 200 && t.data.sent === 1, t);
const got = received.at(-1);
check("encrypted the web push way", got?.headers["content-encoding"] === "aes128gcm" && got.headers.ttl === "86400");
const msg = got && decrypt(phone, got.body);
check("phone can read it", msg?.title?.includes("Notifications are on") && msg.url.includes("/account"), msg);
const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(got.headers.authorization) || [];
const [h, p, s] = (jwt || "..").split(".");
const spki = Buffer.concat([Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"), Buffer.from(publicKey, "base64url")]);
const verifies = crypto.verify("sha256", Buffer.from(`${h}.${p}`), { key: crypto.createPublicKey({ key: spki, format: "der", type: "spki" }), dsaEncoding: "ieee-p1363" }, Buffer.from(s || "", "base64url"));
const claims = JSON.parse(Buffer.from(p || "", "base64url").toString() || "{}");
check("signed with the server's key", k === publicKey && verifies && claims.aud === new URL(PUSH_PREFIX).origin && claims.sub.startsWith("mailto:"), claims);

const others = await req("GET", "/api/collections/push_subs/records", { token: ann.token });
check("you can't see other people's devices", others.data.items.length === 0);

// nightly "new gifts" reaches the phone too
const lf = await mkList(ann, "For Eve to follow");
const fol = (await req("POST", "/api/collections/follows/records", { token: eve.token, body: { user: eve.id, list: lf.id, token: lf.share_token, notify: true } })).data;
await wait(1100);
await req("POST", "/api/collections/items/records", { token: ann.token, body: { list: lf.id, name: "Red scarf" } });
await req("POST", "/api/collections/items/records", { token: ann.token, body: { list: lf.id, name: "Board game" } });
const before = received.length;
await req("POST", "/api/crons/giftlist_follow_digest", { token: su });
await wait(1500);
const dmsg = received.slice(before).filter((r) => r.path === `/eve-${run}`).map((r) => decrypt(phone, r.body));
check("new gifts notification", dmsg.length === 1 && dmsg[0].title.includes("Ann added 2 new gifts") && dmsg[0].body.includes("Red scarf") && dmsg[0].url.includes(`/s/${lf.share_token}`), dmsg);

// turned off for that kind: no notification
await req("PATCH", `/api/collections/users/records/${eve.id}`, { token: eve.token, body: { push_prefs: { digest: false } } });
await req("PATCH", `/api/collections/follows/records/${fol.id}`, { token: eve.token, body: { notify: false } });
await req("PATCH", `/api/collections/follows/records/${fol.id}`, { token: eve.token, body: { notify: true } });
await wait(1100);
await req("POST", "/api/collections/items/records", { token: ann.token, body: { list: lf.id, name: "Mug" } });
const before2 = received.length;
await req("POST", "/api/crons/giftlist_follow_digest", { token: su });
await wait(1500);
check("kinds you turned off don't buzz", received.slice(before2).filter((r) => r.path === `/eve-${run}`).length === 0);

// the push service says the browser is gone: forget the device
answer = 410;
await req("POST", "/api/giftlist/push/test", { token: eve.token });
answer = 201;
check("unsubscribed browsers are removed", (await req("GET", "/api/collections/push_subs/records", { token: eve.token })).data.items.length === 0);

sink.close();
console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
