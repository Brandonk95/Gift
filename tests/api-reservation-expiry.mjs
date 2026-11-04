// Reservation expiry: one-week hold, renew, reminder email, release, bought ones kept.
import { readFileSync } from "node:fs";
import { join } from "node:path";
const MAIL_LOG = join(process.env.TEST_MAIL_DIR || "tests/.mail", "sink.log");
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
const pbDate = (ms) => new Date(ms).toISOString().replace("T", " ");
async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
  return { token: a.token, id: a.record.id, email };
}
const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: SU } })).data.token;
const setRes = (id, body) => req("PATCH", `/api/collections/reservations/records/${id}`, { token: su, body });
const cron = () => req("POST", "/api/crons/giftlist_reservations", { token: su });

const owner = await user("Owner"), friend = await user("Friend"), other = await user("Other");
const list = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.id, title: "Expiry list", occasion: "birthday" } })).data;
const share = list.share_token;
const mk = async (name) => (await req("POST", "/api/collections/items/records", { token: owner.token, body: { list: list.id, name } })).data;
const [a, b, c] = [await mk("Lamp"), await mk("Book"), await mk("Scarf")];
const reserve = (u, item) => req("POST", "/api/collections/reservations/records", { token: u.token, share, body: { item: item.id, user: u.id } });

const r1 = await reserve(friend, a);
const days = (Date.parse(r1.data.expires.replace(" ", "T")) - Date.now()) / 864e5;
check("new reservation held ~7 days", r1.status === 200 && days > 6.9 && days <= 7.01, r1.data);
const hack = await req("PATCH", `/api/collections/reservations/records/${r1.data.id}`, { token: friend.token, share, body: { expires: pbDate(Date.now() + 365 * 864e5) } });
check("can't set your own expiry", hack.status !== 200, hack);
const steal = await req("POST", `/api/giftlist/reservations/${r1.data.id}/renew`, { token: other.token });
check("can't renew someone else's", steal.status === 404, steal);

await setRes(r1.data.id, { expires: pbDate(Date.now() + 2 * 36e5) });
const renew = await req("POST", `/api/giftlist/reservations/${r1.data.id}/renew`, { token: friend.token });
const days2 = (Date.parse(renew.data.expires.replace(" ", "T")) - Date.now()) / 864e5;
check("renew resets to 7 days", renew.status === 200 && days2 > 6.9, renew.data);

// reminder
await setRes(r1.data.id, { expires: pbDate(Date.now() + 3 * 36e5) });
const sinkBefore = readFileSync(MAIL_LOG, "utf8").length;
const c1 = await cron();
check("cron runs", c1.status === 204, c1);
await new Promise((r) => setTimeout(r, 1500));
const after = (await req("GET", `/api/collections/reservations/records/${r1.data.id}`, { token: su })).data;
check("marked as reminded", after.reminded === true, after);
const sink = readFileSync(MAIL_LOG, "utf8").slice(sinkBefore);
check("reminder email sent to the reserver", sink.includes("Renew your reservation") && sink.includes(friend.email), sink.slice(0, 300));
await cron();
await new Promise((r) => setTimeout(r, 800));
const sink2 = readFileSync(MAIL_LOG, "utf8").slice(sinkBefore);
check("only one reminder", sink2.split("Renew your reservation: Lamp").length - 1 <= 2, sink2.length);

// expired but not yet cleaned up: someone else can take it
await setRes(r1.data.id, { expires: pbDate(Date.now() - 60e3) });
const take = await reserve(other, a);
check("expired reservation doesn't block others", take.status === 200, take);

// bought ones don't expire; un-buying restarts the week
const r2 = (await reserve(friend, b)).data;
await req("PATCH", `/api/collections/reservations/records/${r2.id}`, { token: friend.token, share, body: { purchased: true } });
await setRes(r2.id, { expires: pbDate(Date.now() - 60e3) });
const r3 = (await reserve(friend, c)).data;
await setRes(r3.id, { expires: pbDate(Date.now() - 60e3) });
await cron();
await new Promise((r) => setTimeout(r, 800));
const g2 = await req("GET", `/api/collections/reservations/records/${r2.id}`, { token: su });
const g3 = await req("GET", `/api/collections/reservations/records/${r3.id}`, { token: su });
check("bought reservation kept", g2.status === 200, g2);
check("expired reservation released", g3.status === 404, g3);
const unbuy = await req("PATCH", `/api/collections/reservations/records/${r2.id}`, { token: friend.token, share, body: { purchased: false } });
const days3 = (Date.parse(unbuy.data.expires.replace(" ", "T")) - Date.now()) / 864e5;
check("un-marking bought starts a fresh week", unbuy.status === 200 && days3 > 6.9, unbuy.data);
const gone = await req("POST", `/api/giftlist/reservations/${r3.id}/renew`, { token: friend.token });
check("renewing a released one explains it", gone.status === 404 && /released/.test(gone.data.message), gone.data);

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
