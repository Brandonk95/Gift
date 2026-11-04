// The Secret Santa draw (pocketbase/pb_hooks/lib/santa.js). Run: node tests/unit-santa.cjs
const { draw } = require("../pocketbase/pb_hooks/lib/santa.js");
let fails = 0;
const check = (cond, msg) => { if (!cond) { fails++; console.log("FAIL", msg); } };
function valid(ids, excl, pairs) {
  const got = Object.keys(pairs).sort().join(), want = ids.slice().sort().join();
  check(got === want, "everyone gives");
  check(new Set(Object.values(pairs)).size === ids.length, "everyone receives once");
  for (const [g, r] of Object.entries(pairs)) {
    check(g !== r, "no self");
    check(!(excl[g] || []).includes(r) && !(excl[r] || []).includes(g), `exclusion ${g}->${r}`);
  }
}
// random groups, many runs
for (let run = 0; run < 3000; run++) {
  const n = 3 + (run % 12);
  const ids = Array.from({ length: n }, (_, i) => "m" + i);
  const excl = {};
  // pair up couples
  if (n >= 4) for (let i = 0; i + 1 < n && i < 4; i += 2) excl[ids[i]] = [ids[i + 1]];
  const r = draw(ids, excl);
  if (r.error) { check(false, `unexpected ${r.error} n=${n}`); continue; }
  valid(ids, excl, r.pairs);
  if (n >= 4) check(!Object.entries(r.pairs).some(([g, x]) => r.pairs[x] === g), `swap avoided n=${n}`);
}
check(draw(["a", "b"], {}).error === "too_few", "too few");
check(draw(["a", "b", "c"], { a: ["b", "c"] }).error === "no_options", "no options");
check(draw(["a", "b", "c"], { a: ["b"] }).error === "impossible", "3 with a couple is impossible");
const r4 = draw(["a", "b", "c", "d"], { a: ["b"], c: ["d"] });
check(!r4.error, "4 with two couples works"); if (!r4.error) valid(["a","b","c","d"], { a: ["b"], c: ["d"] }, r4.pairs);
// distribution sanity: in a group of 5, each giver gets each allowed recipient sometimes
const seen = {};
for (let i = 0; i < 2000; i++) { const p = draw(["a","b","c","d","e"], {}).pairs; seen[p.a] = (seen[p.a] || 0) + 1; }
check(Object.keys(seen).length === 4, "a can draw any of the other 4: " + JSON.stringify(seen));
console.log(fails ? `${fails} failures` : "all santa checks passed", JSON.stringify(seen));
process.exitCode = fails ? 1 : 0;
