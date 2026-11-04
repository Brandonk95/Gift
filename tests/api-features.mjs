// Newer features: unsubscribe, released + occasion emails, chip in, questions,
// who-gave-what, price checks, Secret Santa messages + reveal, app manifest.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
const MAIL_DIR = process.env.TEST_MAIL_DIR || "tests/.mail";
const sinkPath = join(MAIL_DIR, "sink.log");

async function req(method, path, { token, body, share } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.Authorization = token;
  if (share) h["X-Share-Token"] = share;
  const r = await fetch(base + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch (_) {
    data = t;
  }
  return { status: r.status, data };
}
let fails = 0;
const check = (name, ok, extra) => {
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : JSON.stringify(extra ?? ""));
  if (!ok) fails++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mailMark = () => readFileSync(sinkPath, "utf8").length;
const mailSince = async (mark, ms = 1200) => {
  await wait(ms);
  return readFileSync(sinkPath, "utf8").slice(mark);
};
// newest .eml addressed to someone, with folded headers unfolded
const lastEmlTo = (email) => {
  const files = readdirSync(MAIL_DIR).filter((f) => f.endsWith(".eml")).sort().reverse();
  for (const f of files) {
    const s = readFileSync(join(MAIL_DIR, f), "utf8");
    if (s.includes(email)) return s.replace(/\n[ \t]+/g, " ");
  }
  return "";
};
const pad = (n) => String(n).padStart(2, "0");
const localDay = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
  return { name, token: a.token, id: a.record.id, email };
}
const su = (await req("POST", "/api/collections/_superusers/auth-with-password", { body: { identity: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } })).data?.token;
check("superuser login (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD)", !!su);
const cron = (id) => req("POST", `/api/crons/${id}`, { token: su });

const owner = await user("Olive"), amy = await user("Amy"), bo = await user("Bo");
const mkList = async (o, extra = {}) => (await req("POST", "/api/collections/lists/records", { token: o.token, body: { owner: o.id, title: `List ${run}`, occasion: "birthday", ...extra } })).data;
const add = async (o, list, name, extra = {}) => (await req("POST", "/api/collections/items/records", { token: o.token, body: { list: list.id, name, ...extra } })).data;
const list = await mkList(owner);
const share = list.share_token;

// ---- app manifest -------------------------------------------------------
{
  const m = await req("GET", "/manifest.webmanifest");
  check("manifest has icons and a share target", m.status === 200 && m.data.icons?.length === 3 && m.data.share_target?.action === "/share", m);
  const c = await req("GET", "/api/giftlist/config");
  check("config reports the reservation length", c.data?.reservationDays >= 1, c.data);
}

// ---- chip in together ---------------------------------------------------
{
  const bike = await add(owner, list, "Bike", { price: 300 });
  const p1 = await req("POST", "/api/collections/pledges/records", { token: amy.token, share, body: { item: bike.id, user: amy.id, amount: 100 } });
  check("friend chips in", p1.status === 200 && p1.data.reserver_name === "Amy", p1);
  const p2 = await req("POST", "/api/collections/pledges/records", { token: bo.token, share, body: { item: bike.id, user: bo.id, amount: 50 } });
  check("second friend chips in", p2.status === 200, p2);
  const dup = await req("POST", "/api/collections/pledges/records", { token: amy.token, share, body: { item: bike.id, user: amy.id, amount: 5 } });
  check("one pledge per person per gift", dup.status === 400, dup);
  const forOther = await req("POST", "/api/collections/pledges/records", { token: amy.token, share, body: { item: bike.id, user: bo.id, amount: 5 } });
  check("can't pledge as someone else", forOther.status >= 400, forOther);
  const resv = await req("POST", "/api/collections/reservations/records", { token: bo.token, share, body: { item: bike.id, user: bo.id } });
  check("can't reserve a gift people are chipping in on", resv.status === 400, resv);
  const seenByFriend = await req("GET", `/api/collections/pledges/records?filter=${encodeURIComponent(`item="${bike.id}"`)}`, { token: bo.token, share });
  check("friends see the group", seenByFriend.data?.items?.length === 2, seenByFriend);
  const seenByOwner = await req("GET", `/api/collections/pledges/records?filter=${encodeURIComponent(`item="${bike.id}"`)}`, { token: owner.token, share });
  check("owner doesn't see who chipped in", seenByOwner.data?.items?.length === 0, seenByOwner);
  const ownerPledge = await req("POST", "/api/collections/pledges/records", { token: owner.token, share, body: { item: bike.id, user: owner.id, amount: 5 } });
  check("owner can't chip in on their own gift", ownerPledge.status >= 400, ownerPledge);

  const book = await add(owner, list, "Book");
  await req("POST", "/api/collections/reservations/records", { token: amy.token, share, body: { item: book.id, user: amy.id } });
  const late = await req("POST", "/api/collections/pledges/records", { token: bo.token, share, body: { item: book.id, user: bo.id, amount: 5 } });
  check("can't chip in on a reserved gift", late.status === 400, late);
  const leave = await req("DELETE", `/api/collections/pledges/records/${p2.data.id}`, { token: bo.token, share });
  check("friend can leave the group", leave.status === 204, leave);
}

// ---- anonymous questions ------------------------------------------------
let qid;
{
  const mug = await add(owner, list, "Mug");
  const mark = mailMark();
  const q = await req("POST", "/api/collections/questions/records", { token: amy.token, share, body: { list: list.id, item: mug.id, question: "What size?" } });
  qid = q.data?.id;
  check("friend asks a question", q.status === 200, q);
  check("owner is emailed about the question", (await mailSince(mark)).includes(owner.email));
  const noShare = await req("POST", "/api/collections/questions/records", { token: amy.token, body: { list: list.id, question: "No link?" } });
  check("asking needs the share link", noShare.status >= 400, noShare);
  const preAnswered = await req("POST", "/api/collections/questions/records", { token: amy.token, share, body: { list: list.id, question: "x", answer: "y" } });
  check("can't answer your own question", preAnswered.status >= 400, preAnswered);
  const own = await req("POST", "/api/collections/questions/records", { token: owner.token, share, body: { list: list.id, question: "Me?" } });
  check("owner can't ask on their own list", own.status >= 400, own);

  const seen = await req("GET", `/api/collections/questions/records?filter=${encodeURIComponent(`list="${list.id}"`)}`, { token: owner.token });
  check("owner sees the question but not who asked", seen.data?.items?.length === 1 && !("asker" in seen.data.items[0]) && !JSON.stringify(seen.data).includes(amy.id), seen);
  const friendEdit = await req("PATCH", `/api/collections/questions/records/${qid}`, { token: amy.token, share, body: { answer: "huh" } });
  check("friends can't answer", friendEdit.status >= 400, friendEdit);
  const m2 = mailMark();
  const ans = await req("PATCH", `/api/collections/questions/records/${qid}`, { token: owner.token, body: { answer: "  Large  " } });
  check("owner answers", ans.status === 200 && ans.data.answer === "Large" && !!ans.data.answered_at, ans);
  check("asker is emailed the answer", (await mailSince(m2)).includes(amy.email));
  const bothSee = await req("GET", `/api/collections/questions/records?filter=${encodeURIComponent(`list="${list.id}"`)}`, { token: bo.token, share });
  check("other friends see the answer", bothSee.data?.items?.[0]?.answer === "Large", bothSee);
  const rewrite = await req("PATCH", `/api/collections/questions/records/${qid}`, { token: owner.token, body: { question: "Edited" } });
  check("owner can't rewrite the question", rewrite.status >= 400 || rewrite.data?.question === "What size?", rewrite);
}

// ---- unsubscribe --------------------------------------------------------
{
  const eml = lastEmlTo(owner.email);
  const header = /List-Unsubscribe: <([^>]+)>/i.exec(eml)?.[1];
  check("optional emails carry List-Unsubscribe headers", !!header && /List-Unsubscribe-Post: List-Unsubscribe=One-Click/i.test(eml), eml.slice(0, 400));
  const path = header ? header.replace(/^https?:\/\/[^/]+/, "") : "";
  const tampered = await req("POST", path.replace(/t=[^&]+/, "t=nope"));
  check("a wrong token is refused", tampered.status === 400, tampered);
  const wrongKind = await req("POST", path.replace(/k=[^&]+/, "k=digest"));
  check("a token only works for its kind", wrongKind.status === 400, wrongKind);
  const off = await req("POST", path);
  check("one-click unsubscribe works", off.status === 200 && off.data.subscribed === false, off);
  const me = await req("GET", `/api/collections/users/records/${owner.id}`, { token: owner.token });
  check("the preference is saved", me.data?.email_prefs?.questions === false, me.data);
  const mark = mailMark();
  await req("POST", "/api/collections/questions/records", { token: bo.token, share, body: { list: list.id, question: "Colour?" } });
  check("no more question emails after unsubscribing", !(await mailSince(mark)).includes(owner.email));
  const q = new URLSearchParams(path.split("?")[1]);
  const back = await req("POST", "/api/giftlist/unsubscribe", { body: { u: q.get("u"), k: q.get("k"), t: q.get("t"), resubscribe: true } });
  check("resubscribe from the same link", back.status === 200 && back.data.subscribed === true, back);
}

// ---- reservation released email ----------------------------------------
{
  const lamp = await add(owner, list, "Lamp");
  const r = (await req("POST", "/api/collections/reservations/records", { token: bo.token, share, body: { item: lamp.id, user: bo.id } })).data;
  const past = new Date(Date.now() - 6e4).toISOString().replace("T", " ");
  await req("PATCH", `/api/collections/reservations/records/${r.id}`, { token: su, body: { expires: past, reminded: true } });
  const mark = mailMark();
  const c = await cron("giftlist_reservations");
  const mail = await mailSince(mark, 1500);
  check("expired hold is released", c.status === 204 && (await req("GET", `/api/collections/reservations/records/${r.id}`, { token: su })).status === 404);
  check("whoever reserved is told it ended", mail.includes(bo.email), mail);
}

// ---- occasion reminder a week ahead -------------------------------------
{
  const soon = await mkList(owner, { event_date: `${localDay(7)} 12:00:00.000Z` });
  await add(owner, soon, "Kite");
  const f = (await req("POST", "/api/collections/follows/records", { token: amy.token, body: { user: amy.id, list: soon.id, token: soon.share_token } })).data;
  await req("PATCH", `/api/collections/follows/records/${f.id}`, { token: amy.token, body: { notify: true } });
  const hack = await req("PATCH", `/api/collections/follows/records/${f.id}`, { token: amy.token, body: { occasion_reminded: "2020-01-01" } });
  check("occasion_reminded is server-only", hack.status >= 400, hack);
  const mark = mailMark();
  await cron("giftlist_follow_digest");
  const mail = await mailSince(mark, 1500);
  const hourNote = "(needs the test server started with DIGEST_HOUR = the current hour)";
  check(`follower is reminded a week before ${hourNote}`, mail.includes(amy.email) && /day/.test(mail), mail);
  const mark2 = mailMark();
  await cron("giftlist_follow_digest");
  const again = await mailSince(mark2, 1500);
  check("only reminded once", !again.includes(`${amy.email}> subject: ${"=?"}`) && !/is in 7 day/.test(again), again);
}

// ---- who gave what -----------------------------------------------------
{
  const past = await mkList(owner, { event_date: `${localDay(-2)} 12:00:00.000Z` });
  const g = await add(owner, past, "Scarf");
  await req("POST", "/api/collections/reservations/records", { token: amy.token, share: past.share_token, body: { item: g.id, user: amy.id } });
  const off = await req("GET", `/api/giftlist/lists/${past.id}/givers`, { token: owner.token });
  check("givers stay hidden unless the owner turned it on", off.status === 400, off);
  await req("PATCH", `/api/collections/lists/records/${past.id}`, { token: owner.token, body: { reveal_givers: true } });
  const on = await req("GET", `/api/giftlist/lists/${past.id}/givers`, { token: owner.token });
  check("after the date the owner sees who gave what", on.status === 200 && on.data[0]?.givers?.[0] === "Amy", on);
  const other = await req("GET", `/api/giftlist/lists/${past.id}/givers`, { token: amy.token });
  check("nobody else can see it", other.status === 404, other);
  const future = await mkList(owner, { event_date: `${localDay(5)} 12:00:00.000Z`, reveal_givers: true });
  const early = await req("GET", `/api/giftlist/lists/${future.id}/givers`, { token: owner.token });
  check("not before the date", early.status === 400, early);
  const thanked = await req("PATCH", `/api/collections/items/records/${g.id}`, { token: owner.token, body: { thanked: true } });
  check("owner can tick off thank-yous", thanked.status === 200 && thanked.data.thanked === true, thanked);
}

// ---- price checks -------------------------------------------------------
{
  const forged = await req("POST", "/api/collections/items/records", { token: owner.token, body: { list: list.id, name: "TV", price: 500, current_price: 1 } });
  check("current_price can't be set by owners", forged.status >= 400, forged);
  const tv = await add(owner, list, "TV", { price: 500, url: "https://example.com/tv" });
  await req("PATCH", `/api/collections/items/records/${tv.id}`, { token: su, body: { current_price: 400, price_alerted: 400, price_checked: "2026-01-01 00:00:00.000Z" } });
  const edited = await req("PATCH", `/api/collections/items/records/${tv.id}`, { token: owner.token, body: { price: 450 } });
  check("changing the price starts the checks over", edited.status === 200 && edited.data.current_price === 0 && edited.data.price_alerted === 0 && !edited.data.price_checked, edited.data);
}

// ---- Secret Santa messages and reveal -----------------------------------
{
  const ex = (await req("POST", "/api/collections/exchanges/records", { token: owner.token, body: { owner: owner.id, name: `Santa ${run}`, budget: 20 } })).data;
  const detail = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: owner.token })).data;
  const join = detail.exchange.joinLink.split("/x/")[1];
  await req("POST", `/api/giftlist/join/${join}`, { token: amy.token, body: {} });
  await req("POST", `/api/giftlist/join/${join}`, { token: bo.token, body: {} });
  const early = await req("GET", `/api/giftlist/exchanges/${ex.id}/messages`, { token: amy.token });
  check("no messages before the draw", early.status === 400, early);
  await req("POST", `/api/giftlist/exchanges/${ex.id}/draw`, { token: owner.token });

  const people = [owner, amy, bo];
  const matchOf = {};
  for (const p of people) matchOf[p.name] = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: p.token })).data.match.name;
  const santa = people.find((p) => matchOf[p.name] === "Amy");
  const mark = mailMark();
  const sent = await req("POST", `/api/giftlist/exchanges/${ex.id}/messages`, { token: santa.token, body: { to: "recipient", text: "Hi from your Santa" } });
  check("Santa messages the person they're buying for", sent.status === 200 && sent.data.recipient.messages.length === 1, sent);
  const mail = await mailSince(mark);
  check("recipient is emailed", mail.includes(amy.email), mail);
  check("the email doesn't name the Santa", !lastEmlTo(amy.email).includes(santa.name + " sent"), "");
  const amyView = (await req("GET", `/api/giftlist/exchanges/${ex.id}/messages`, { token: amy.token })).data;
  check("recipient sees the message, Santa stays anonymous", amyView.santa?.messages?.[0]?.text === "Hi from your Santa" && amyView.santa.name === "" && !JSON.stringify(amyView).includes(santa.id), amyView);
  const reply = await req("POST", `/api/giftlist/exchanges/${ex.id}/messages`, { token: amy.token, body: { to: "santa", text: "Thanks!" } });
  check("recipient replies to their Santa", reply.status === 200 && reply.data.santa.messages.length === 2, reply);
  const outsider = await user("Zed");
  const nosy = await req("GET", `/api/giftlist/exchanges/${ex.id}/messages`, { token: outsider.token });
  check("outsiders can't read messages", nosy.status === 403, nosy);
  const direct = await req("GET", `/api/collections/exchange_messages/records`, { token: amy.token });
  check("messages aren't readable through the collection API", direct.status >= 400 || direct.data?.items?.length === 0, direct);
  const empty = await req("POST", `/api/giftlist/exchanges/${ex.id}/messages`, { token: amy.token, body: { to: "santa", text: "   " } });
  check("empty messages are refused", empty.status === 400, empty);

  check("no Santa shown before the reveal", !(await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: amy.token })).data.santa);
  const notOrg = await req("POST", `/api/giftlist/exchanges/${ex.id}/reveal`, { token: amy.token, body: {} });
  check("only the organizer reveals", notOrg.status === 403, notOrg);
  const rev = await req("POST", `/api/giftlist/exchanges/${ex.id}/reveal`, { token: owner.token, body: {} });
  check("organizer reveals", rev.status === 200 && rev.data.exchange.revealed === true, rev.data?.exchange);
  const after = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: amy.token })).data;
  check("after the reveal everyone sees their Santa", after.santa?.name === santa.name, after.santa);
  const msgsAfter = (await req("GET", `/api/giftlist/exchanges/${ex.id}/messages`, { token: amy.token })).data;
  check("message thread now names the Santa", msgsAfter.santa?.name === santa.name, msgsAfter.santa);
  const hide = await req("POST", `/api/giftlist/exchanges/${ex.id}/reveal`, { token: owner.token, body: { hide: true } });
  check("organizer can hide it again", hide.data?.exchange?.revealed === false && !(await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: amy.token })).data.santa, hide.data?.exchange);
  const forge = await req("PATCH", `/api/collections/exchanges/records/${ex.id}`, { token: owner.token, body: { revealed: true } });
  check("revealed can't be set through the collection API", forge.status >= 400, forge);
}

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
