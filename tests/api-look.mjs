// List look and privacy: banner themes, cover photos, friends' default view, and
// private ideas boards that share links can't open.
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
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
const check = (name, ok, extra) => {
  console.log(ok ? "ok  " : "FAIL", name, ok ? "" : JSON.stringify(extra ?? ""));
  if (!ok) fails++;
};
async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
  return { token: a.token, id: a.record.id };
}
const owner = await user("Olive"), friend = await user("Finn");

// ---- themes, default view, cover photo ----------------------------------
let list = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.id, title: "Look", occasion: "birthday", theme: "confetti", friend_view: "board" } })).data;
check("theme and friends' view are saved", list?.theme === "confetti" && list?.friend_view === "board", list);
const badTheme = await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: owner.token, body: { theme: "lava" } });
check("unknown themes are refused", badTheme.status === 400, badTheme);
const badView = await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: owner.token, body: { friend_view: "carousel" } });
check("unknown views are refused", badView.status === 400, badView);

// 1x1 PNG
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const fd = new FormData();
fd.append("cover", new Blob([png], { type: "image/png" }), "banner.png");
const up = await fetch(`${base}/api/collections/lists/records/${list.id}`, { method: "PATCH", headers: { Authorization: owner.token }, body: fd });
list = await up.json();
check("cover photo uploads", up.status === 200 && !!list.cover, list);
const img = await fetch(`${base}/api/files/lists/${list.id}/${list.cover}?thumb=1200x400`);
check("cover photo is served (with banner thumbnail)", img.status === 200 && (img.headers.get("content-type") || "").startsWith("image/"), img.status);
const fdBad = new FormData();
fdBad.append("cover", new Blob(["not an image"], { type: "text/plain" }), "x.txt");
const upBad = await fetch(`${base}/api/collections/lists/records/${list.id}`, { method: "PATCH", headers: { Authorization: owner.token }, body: fdBad });
check("only images are accepted as covers", upBad.status === 400, upBad.status);
const cleared = await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: owner.token, body: { cover: null } });
check("cover photo can be removed", cleared.status === 200 && !cleared.data.cover, cleared.data);
const seen = await req("GET", `/api/collections/lists/records/${list.id}`, { token: friend.token, share: list.share_token });
check("friends see the theme and view", seen.data?.theme === "confetti" && seen.data?.friend_view === "board", seen.data);

// ---- private ideas boards ----------------------------------------------
const board = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.id, title: "Ideas", occasion: "other", private: true } })).data;
const idea = (await req("POST", "/api/collections/items/records", { token: owner.token, body: { list: board.id, name: "Kayak" } })).data;
const share = board.share_token;
check("owner sees their private board", (await req("GET", `/api/collections/lists/records/${board.id}`, { token: owner.token })).status === 200);
check("share link doesn't open a private board", (await req("GET", `/api/collections/lists/records/${board.id}`, { token: friend.token, share })).status === 404);
check("…even signed out", (await req("GET", `/api/collections/lists/records/${board.id}`, { share })).status === 404);
const items = await req("GET", `/api/collections/items/records?filter=${encodeURIComponent(`list="${board.id}"`)}`, { token: friend.token, share });
check("its gifts stay hidden", items.data?.items?.length === 0, items);
const res = await req("POST", "/api/collections/reservations/records", { token: friend.token, share, body: { item: idea.id, user: friend.id } });
check("nobody can reserve from it", res.status >= 400, res);
const pledge = await req("POST", "/api/collections/pledges/records", { token: friend.token, share, body: { item: idea.id, user: friend.id, amount: 5 } });
check("or chip in", pledge.status >= 400, pledge);
const q = await req("POST", "/api/collections/questions/records", { token: friend.token, share, body: { list: board.id, question: "?" } });
check("or ask questions", q.status >= 400, q);
const invite = await req("POST", `/api/giftlist/lists/${board.id}/share`, { token: owner.token, body: { emails: ["x@example.test"] } });
check("private boards can't be emailed out", invite.status === 400, invite);

const ex = (await req("POST", "/api/collections/exchanges/records", { token: owner.token, body: { owner: owner.id, name: `Santa ${run}` } })).data;
const santa = await req("POST", `/api/giftlist/exchanges/${ex.id}/my-list`, { token: owner.token, body: { list: board.id } });
check("a private board can't be your Secret Santa list", santa.status === 400, santa);

await req("PATCH", `/api/collections/lists/records/${board.id}`, { token: owner.token, body: { private: false } });
check("turning private off opens the link", (await req("GET", `/api/collections/lists/records/${board.id}`, { token: friend.token, share })).status === 200);
const nowItems = await req("GET", `/api/collections/items/records?filter=${encodeURIComponent(`list="${board.id}"`)}`, { token: friend.token, share });
check("and shows its gifts", nowItems.data?.items?.length === 1, nowItems);

// ---- Gravatar hash -------------------------------------------------------
{
  const { createHash } = await import("node:crypto");
  const email = `Mixed.Case.${run}@Example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name: "Gail" } });
  const g = (await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } })).data;
  const want = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  check("accounts get their Gravatar hash", g.record.email_hash === want, g.record);
  const forge = await req("PATCH", `/api/collections/users/records/${g.record.id}`, { token: g.token, body: { email_hash: "0".repeat(64) } });
  check("people can't set their own hash", forge.status >= 400, forge);
  const signup = await req("POST", "/api/collections/users/records", { body: { email: `h.${run}@example.test`, password: PW, passwordConfirm: PW, email_hash: "x" } });
  check("or set it at sign-up", signup.status === 400, signup);
  const peek = await req("GET", `/api/collections/users/records/${g.record.id}`, { token: friend.token });
  check("other people can't read it", peek.status === 404, peek);
}

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
