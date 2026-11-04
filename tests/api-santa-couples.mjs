// Two couples, many redraws: partners must never draw each other.
const base = process.env.TEST_URL || "http://127.0.0.1:8090";
const run = Date.now().toString(36);
const PW = "Pw" + run + "x9!";
async function req(method, path, { token, body } = {}) {
  const r = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { Authorization: token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  return { status: r.status, data: t ? JSON.parse(t) : null };
}
async function user(name) {
  const email = `${name.toLowerCase()}.${run}@example.test`;
  await req("POST", "/api/collections/users/records", { body: { email, password: PW, passwordConfirm: PW, name } });
  const a = await req("POST", "/api/collections/users/auth-with-password", { body: { identity: email, password: PW } });
  return { name, token: a.data.token, id: a.data.record.id };
}
const ppl = await Promise.all(["Ann", "Andy", "Bea", "Bob"].map(user));
const [ann, andy, bea, bob] = ppl;
const ex = (await req("POST", "/api/collections/exchanges/records", { token: ann.token, body: { owner: ann.id, name: "Couples" } })).data;
const tok = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: ann.token })).data.exchange.joinLink.split("/x/")[1];
for (const p of [andy, bea, bob]) await req("POST", `/api/giftlist/join/${tok}`, { token: p.token, body: {} });
const ids = Object.fromEntries((await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: ann.token })).data.members.map((m) => [m.name, m.id]));
await req("POST", `/api/giftlist/exchanges/${ex.id}/members/${ids.Ann}/exclusions`, { token: ann.token, body: { exclude: [ids.Andy] } });
await req("POST", `/api/giftlist/exchanges/${ex.id}/members/${ids.Bob}/exclusions`, { token: ann.token, body: { exclude: [ids.Bea] } });
const partner = { Ann: "Andy", Andy: "Ann", Bea: "Bob", Bob: "Bea" };
let bad = 0;
for (let i = 0; i < 15; i++) {
  const d = await req("POST", `/api/giftlist/exchanges/${ex.id}/draw`, { token: ann.token });
  if (d.status !== 200) { console.log("draw failed", d.data); bad++; continue; }
  for (const p of ppl) {
    const m = (await req("GET", `/api/giftlist/exchanges/${ex.id}`, { token: p.token })).data.match.name;
    if (m === partner[p.name] || m === p.name) { bad++; console.log(`FAIL draw ${i}: ${p.name} -> ${m}`); }
  }
}
console.log(bad ? `${bad} violations` : "15 redraws: nobody drew their partner");
process.exitCode = bad ? 1 : 0;
