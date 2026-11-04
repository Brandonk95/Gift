// Secret Santa API: create, invite, join, rules, draw, privacy.
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
let fails = 0;
const ok = (c, m) => {
  console.log(c ? "ok  " : "FAIL", m);
  if (!c) fails++;
};
async function req(method, path, { token, body } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  return { status: r.status, data: t ? JSON.parse(t) : null };
}
async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } });
  const list = await req("POST", "/api/collections/lists/records", { token: a.data.token, body: { owner: a.data.record.id, title: `${name}'s wishes`, occasion: "christmas" } });
  return { name, email, token: a.data.token, id: a.data.record.id, list: list.data.id };
}
const [olivia, ben, cara, dan] = await Promise.all(["Olivia", "Ben", "Cara", "Dan"].map(user));
const people = { Olivia: olivia, Ben: ben, Cara: cara, Dan: dan };

// create
let r = await req("POST", "/api/collections/exchanges/records", {
  token: olivia.token,
  body: { owner: olivia.id, name: "Family Secret Santa", budget: 25, event_date: "2026-12-24 00:00:00.000Z", message: "Have fun!", status: "drawn" },
});
ok(r.status === 400, "can't create an exchange that's already drawn");
r = await req("POST", "/api/collections/exchanges/records", {
  token: olivia.token,
  body: { owner: olivia.id, name: "Family Secret Santa", budget: 25, event_date: "2026-12-24 00:00:00.000Z", message: "Have fun!" },
});
ok(r.status === 200 && r.data.status === "open", "organizer creates exchange (starts open)");
const ex = r.data;
r = await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: olivia.token });
ok(r.data.members.length === 1 && r.data.members[0].you && r.data.exchange.joinLink, "organizer is a member and sees the join link");
const token = r.data.exchange.joinLink.split("/x/")[1];

// joining
ok((await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: ben.token })).status === 403, "outsider can't open the exchange");
r = await req("GET", `/api/giftlist/join/${token}`, { token: ben.token });
ok(r.status === 200 && r.data.name === "Family Secret Santa" && !r.data.joinLink && !r.data.alreadyIn, "join preview works and hides the join link");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: ben.token, body: { list: cara.list } })).status === 403, "can't share someone else's list");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: ben.token, body: { list: ben.list } })).status === 200, "Ben joins with his list");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: cara.token, body: { list: cara.list } })).status === 200, "Cara joins");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: dan.token, body: {} })).status === 200, "Dan joins without a list");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: dan.token, body: {} })).status === 200, "joining twice is harmless");

// email invite + claim
const eveEmail = `eve.${run}@example.test`;
r = await req("POST", `/api/giftlist/exchanges/${ex.id}/invite`, { token: olivia.token, body: { emails: [eveEmail, ben.email] } });
ok(r.status === 200 && r.data.sent === 1 && r.data.alreadyIn.length === 1, "invite emails Eve and skips Ben (already in) " + JSON.stringify(r.data));
ok((await req("POST", `/api/giftlist/exchanges/${ex.id}/invite`, { token: ben.token, body: { emails: ["x@example.test"] } })).status === 403, "only organizer invites");
r = await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: olivia.token });
ok(r.data.members.length === 5 && r.data.members.some((m) => !m.joined && m.email === eveEmail), "Eve shows as invited, organizer sees her email");
r = await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: ben.token });
ok(r.data.members.every((m) => !("email" in m) && !("exclusions" in m)) && !r.data.exchange.joinLink, "members don't see emails, rules or join link");
const eve = await user("Eve");
people.Eve = eve;
ok((await req("POST", `/api/giftlist/join/${token}`, { token: eve.token, body: { list: eve.list } })).status === 200, "Eve joins");
r = await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: olivia.token });
ok(r.data.members.length === 5 && r.data.members.every((m) => m.joined), "Eve's invite was claimed (no duplicate)");
const byName = Object.fromEntries(r.data.members.map((m) => [m.name, m.id]));

// raw API privacy
r = await req("GET", "/api/collections/exchange_members/records", { token: olivia.token });
ok(r.status !== 200 || (r.data.items || []).length === 0, `raw member records hidden from organizer (status ${r.status})`);
ok((await req("GET", `/api/collections/exchanges/records/${ex.id}`, { token: ben.token })).status === 200, "members can read the exchange record");
const stranger = await user("Zed");
ok((await req("GET", `/api/collections/exchanges/records/${ex.id}`, { token: stranger.token })).status === 404, "strangers can't read the exchange record");
ok((await req("PATCH", `/api/collections/exchanges/records/${ex.id}`, { token: olivia.token, body: { status: "drawn" } })).status >= 400, "status can't be changed through the API");

// exclusions
ok((await req("POST", `/api/giftlist/exchanges/${ex.id}/members/${byName.Ben}/exclusions`, { token: ben.token, body: { exclude: [byName.Cara] } })).status === 403, "only organizer sets rules");
r = await req("POST", `/api/giftlist/exchanges/${ex.id}/members/${byName.Ben}/exclusions`, { token: olivia.token, body: { exclude: [byName.Cara] } });
ok(r.status === 200 && r.data.members.find((m) => m.name === "Cara").exclusions.includes(byName.Ben), "rule is mirrored onto Cara");

// draw
ok((await req("POST", `/api/giftlist/exchanges/${ex.id}/draw`, { token: ben.token })).status === 403, "only organizer draws");
r = await req("POST", `/api/giftlist/exchanges/${ex.id}/draw`, { token: olivia.token });
ok(r.status === 200 && r.data.drawn === 5 && r.data.emailed === 5, "draw: 5 people, 5 emails " + JSON.stringify(r.data));
const matches = {};
for (const p of Object.values(people)) {
  const d = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: p.token })).data;
  matches[p.name] = d.match && d.match.name;
  ok(d.match && d.match.name !== p.name && !JSON.stringify(d).includes("recipient"), `${p.name} sees only their own match`);
}
ok(new Set(Object.values(matches)).size === 5, "everyone is somebody's match " + JSON.stringify(matches));
ok(matches.Ben !== "Cara" && matches.Cara !== "Ben", "Ben and Cara don't draw each other");
const danSanta = people[Object.keys(matches).find((k) => matches[k] === "Dan")];
ok((await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: danSanta.token })).data.match.list === null, "Dan's Santa sees he has no list yet");

// after the draw
r = await req("POST", `/api/giftlist/exchanges/${ex.id}/my-list`, { token: dan.token, body: { list: dan.list } });
ok(r.status === 200 && r.data.me.listTitle === "Dan's wishes", "Dan picks a list after the draw");
ok(!!(await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: danSanta.token })).data.match.list?.token, "Dan's Santa now gets his list link");
ok((await req("POST", `/api/giftlist/join/${token}`, { token: stranger.token, body: {} })).status === 400, "can't join after the draw");
ok((await req("POST", `/api/giftlist/exchanges/${ex.id}/members/${byName.Dan}/remove`, { token: olivia.token })).status === 400, "can't remove people after the draw");
r = await req("GET", "/api/giftlist/exchanges", { token: ben.token });
ok(r.data.length === 1 && r.data[0].matchName === matches.Ben && r.data[0].joined === 5, "exchange list shows Ben his match");
r = await req("POST", `/api/giftlist/exchanges/${ex.id}/draw`, { token: olivia.token });
ok(r.status === 200 && r.data.redraw === true, "redraw works");
console.log(fails ? `\n${fails} FAILED` : "\nall API checks passed");
process.exitCode = fails ? 1 : 0;
