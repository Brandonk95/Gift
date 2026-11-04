// Tester flag: only superusers can set it; testers can reserve on and see reservations of their own lists.
import { readFileSync } from "node:fs";
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
const SU = process.env.TEST_ADMIN_PASSWORD;
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

const email = `owner.${run}@example.test`;
const signup = await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name: "Owner", tester: true } });
check("can't sign up as a tester", signup.status === 400, signup);
await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name: "Owner" } });
let a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
const selfSet = await req("PATCH", `/api/collections/users/records/${a.record.id}`, { token: a.token, body: { tester: true } });
check("can't make yourself a tester", selfSet.status !== 200, selfSet);
const rename = await req("PATCH", `/api/collections/users/records/${a.record.id}`, { token: a.token, body: { name: "Owner2" } });
check("can still edit your own profile", rename.status === 200, rename);

const list = (await req("POST", "/api/collections/lists/records", { token: a.token, body: { owner: a.record.id, title: "Test list", occasion: "birthday" } })).data;
const item = (await req("POST", "/api/collections/items/records", { token: a.token, body: { list: list.id, name: "Socks" } })).data;
const share = list.share_token;
const before = await req("POST", "/api/collections/reservations/records", { token: a.token, share, body: { item: item.id, user: a.record.id } });
check("normal owner can't reserve own gift", before.status === 400, before);

const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: SU } })).data;
const flip = await req("PATCH", `/api/collections/users/records/${a.record.id}`, { token: su.token, body: { tester: true } });
check("superuser can set tester", flip.status === 200 && flip.data.tester === true, flip);
a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
check("tester flag is on the auth record", a.record.tester === true);

const res = await req("POST", "/api/collections/reservations/records", { token: a.token, share, body: { item: item.id, user: a.record.id } });
check("tester can reserve own gift", res.status === 200, res);
const seen = await req("GET", `/api/collections/reservations/records?filter=${encodeURIComponent(`item.list="${list.id}"`)}`, { token: a.token, share });
check("tester sees reservations on own list", seen.data?.items?.length === 1, seen);
const noShare = await req("POST", "/api/collections/reservations/records", { token: a.token, body: { item: item.id, user: a.record.id } });
check("still needs the share link", noShare.status !== 200, noShare);
const del = await req("DELETE", `/api/collections/reservations/records/${res.data.id}`, { token: a.token, share });
check("tester can cancel", del.status === 204, del);

// a non-tester friend reserving, then the normal owner can't see it
const femail = `friend.${run}@example.test`;
await req("POST", "/api/collections/users/records", { body: { email: femail, password: PW, passwordConfirm: PW, name: "Friend" } });
const f = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: femail, password: PW } })).data;
const fl = (await req("POST", "/api/collections/lists/records", { token: f.token, body: { owner: f.record.id, title: "Friend list", occasion: "birthday" } })).data;
const fi = (await req("POST", "/api/collections/items/records", { token: f.token, body: { list: fl.id, name: "Mug" } })).data;
await req("POST", "/api/collections/reservations/records", { token: a.token, share: fl.share_token, body: { item: fi.id, user: a.record.id } });
const fseen = await req("GET", `/api/collections/reservations/records?filter=${encodeURIComponent(`item.list="${fl.id}"`)}`, { token: f.token, share: fl.share_token });
check("normal owners still can't see reservations", fseen.data?.items?.length === 0, fseen);

console.log(fails ? `${fails} failed` : "all passed");
console.log("tester login for the browser:", email);
process.exitCode = fails ? 1 : 0;
