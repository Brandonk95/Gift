// Two owners on one list: the invite link, what the co-owner can and can't do,
// reservations staying hidden from both owners, leaving and removing, and that
// an empty co-owner never lets signed-out visitors in.
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
const owner = await user("Olive"), partner = await user("Pat"), friend = await user("Finn");

const list = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.id, title: "Our wedding", occasion: "wedding" } })).data;
const share = list.share_token;
const gift = (await req("POST", "/api/collections/items/records", { token: owner.token, body: { list: list.id, name: "Stand mixer" } })).data;
const board = (await req("POST", "/api/collections/lists/records", { token: owner.token, body: { owner: owner.id, title: "Ideas", occasion: "other", private: true } })).data;

// ---- nobody signed in, and no co-owner yet --------------------------------
check("signed out can't open a list without its link", (await req("GET", `/api/collections/lists/records/${list.id}`)).status === 404);
check("signed out can't open a private board", (await req("GET", `/api/collections/lists/records/${board.id}`, { share: board.share_token })).status === 404);
check("signed out can't edit a list", (await req("PATCH", `/api/collections/lists/records/${list.id}`, { body: { title: "hacked" } })).status === 404);
check("signed out can't add gifts", (await req("POST", "/api/collections/items/records", { body: { list: list.id, name: "x" } })).status >= 400);
const signedOutItems = await req("GET", `/api/collections/items/records?filter=${encodeURIComponent(`list="${list.id}"`)}`);
check("signed out sees no gifts without the link", signedOutItems.data?.items?.length === 0, signedOutItems.data);

// a friend reserves and asks a question
check("friend reserves", (await req("POST", "/api/collections/reservations/records", { token: friend.token, share, body: { item: gift.id, user: friend.id } })).status === 200);
const question = (await req("POST", "/api/collections/questions/records", { token: friend.token, share, body: { list: list.id, question: "Which color?" } })).data;
check("signed out with the link still sees what's taken", (await req("GET", `/api/collections/reservations/records?filter=${encodeURIComponent(`item="${gift.id}"`)}`, { share })).data?.items?.length === 1);

// ---- the invite ---------------------------------------------------------
check("the partner can't see the list yet", (await req("GET", `/api/collections/lists/records/${list.id}`, { token: partner.token })).status === 404);
check("only the owner can invite", (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/invite`, { token: partner.token })).status === 403);
check("the owner can't set a co-owner directly", (await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: owner.token, body: { co_owner: partner.id } })).status !== 200);
const invite = (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/invite`, { token: owner.token })).data;
check("invite link made", /^[a-z0-9]{24}$/.test(invite?.token || ""), invite);
const info = await req("GET", `/api/giftlist/co-owner/${invite.token}`);
check("invite shows the list signed out, without its id", info.data?.title === "Our wedding" && info.data?.owner_name === "Olive" && !info.data?.id, info.data);
check("the owner can't accept their own invite", (await req("POST", `/api/giftlist/co-owner/${invite.token}`, { token: owner.token })).status === 400);
check("the partner accepts", (await req("POST", `/api/giftlist/co-owner/${invite.token}`, { token: partner.token })).status === 200);
check("the link works only once", (await req("POST", `/api/giftlist/co-owner/${invite.token}`, { token: friend.token })).status === 404);

// ---- what the co-owner can do -------------------------------------------
const seen = (await req("GET", `/api/collections/lists/records/${list.id}`, { token: partner.token })).data;
check("co-owner sees the list, named", seen?.co_owner === partner.id && seen?.co_owner_name === "Pat" && !("co_invite" in seen), seen);
const added = await req("POST", "/api/collections/items/records", { token: partner.token, body: { list: list.id, name: "Towels" } });
check("co-owner adds gifts", added.status === 200, added.data);
check("co-owner edits gifts", (await req("PATCH", `/api/collections/items/records/${gift.id}`, { token: partner.token, body: { description: "Red" } })).status === 200);
check("co-owner changes settings", (await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: partner.token, body: { description: "Thanks!" } })).status === 200);
check("…without renaming the owner", (await req("GET", `/api/collections/lists/records/${list.id}`, { token: owner.token })).data?.owner_name === "Olive");
check("co-owner answers questions", (await req("PATCH", `/api/collections/questions/records/${question.id}`, { token: partner.token, body: { answer: "Red" } })).status === 200);
check("co-owner can't take the list", (await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: partner.token, body: { owner: partner.id } })).status !== 200);
check("co-owner can't add someone else", (await req("PATCH", `/api/collections/lists/records/${list.id}`, { token: partner.token, body: { co_owner: friend.id } })).status !== 200);
check("co-owner can't delete the list", (await req("DELETE", `/api/collections/lists/records/${list.id}`, { token: partner.token })).status !== 204);

// ---- surprises stay surprises -------------------------------------------
const theirView = await req("GET", `/api/collections/reservations/records?filter=${encodeURIComponent(`item.list="${list.id}"`)}`, { token: partner.token, share });
check("co-owner doesn't see reservations", theirView.data?.items?.length === 0, theirView.data);
check("co-owner can't reserve on their own list", (await req("POST", "/api/collections/reservations/records", { token: partner.token, share, body: { item: added.data.id, user: partner.id } })).status !== 200);
check("co-owner can't chip in on their own list", (await req("POST", "/api/collections/pledges/records", { token: partner.token, share, body: { item: added.data.id, user: partner.id } })).status !== 200);
check("signed out with the link still sees what's taken", (await req("GET", `/api/collections/reservations/records?filter=${encodeURIComponent(`item="${gift.id}"`)}`, { share })).data?.items?.length === 1);

// ---- leaving and removing -----------------------------------------------
check("a stranger can't remove the co-owner", (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/remove`, { token: friend.token })).status === 403);
check("co-owner leaves", (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/remove`, { token: partner.token })).status === 200);
check("…and can't see the list anymore", (await req("GET", `/api/collections/lists/records/${list.id}`, { token: partner.token })).status === 404);
const again = (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/invite`, { token: owner.token })).data;
await req("POST", `/api/giftlist/co-owner/${again.token}`, { token: partner.token });
check("a second co-owner can't be invited while there's one", (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/invite`, { token: owner.token })).status === 400);
check("owner removes the co-owner", (await req("POST", `/api/giftlist/lists/${list.id}/co-owner/remove`, { token: owner.token })).status === 200);
check("…who loses access", (await req("PATCH", `/api/collections/items/records/${gift.id}`, { token: partner.token, body: { description: "x" } })).status === 404);

console.log(fails ? `${fails} failed` : "all passed");
process.exitCode = fails ? 1 : 0;
