// Secret Santa draw. Pure JS (no PocketBase globals) so it can be tested in Node.
//
// draw(ids, exclusions, random?) → { pairs: { giverId: recipientId } } or { error }
//   ids:        member ids taking part
//   exclusions: { id: [ids they can't draw] }; applied both ways, so excluding
//               partners on one side keeps them apart in both directions
//
// Nobody draws themselves. With 4+ people it also avoids two people just
// swapping gifts with each other, unless the exclusions leave no other way.

function shuffle(arr, random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function blockedPairs(ids, exclusions) {
  const blocked = {};
  for (const id of ids) blocked[id] = { [id]: true };
  for (const id of ids) {
    for (const other of (exclusions && exclusions[id]) || []) {
      if (!blocked[other]) continue; // not taking part
      blocked[id][other] = true;
      blocked[other][id] = true;
    }
  }
  return blocked;
}

// backtracking search; givers with the fewest options go first
function search(ids, blocked, noSwaps, random) {
  const givers = shuffle(ids, random).sort(
    (a, b) => ids.filter((x) => !blocked[a][x]).length - ids.filter((x) => !blocked[b][x]).length
  );
  const pairs = {};
  const taken = {};
  let steps = 0;

  function place(i) {
    if (i === givers.length) return true;
    if (++steps > 200000) return false; // give up on pathological inputs
    const giver = givers[i];
    for (const r of shuffle(ids, random)) {
      if (taken[r] || blocked[giver][r]) continue;
      if (noSwaps && pairs[r] === giver) continue;
      pairs[giver] = r;
      taken[r] = true;
      if (place(i + 1)) return true;
      delete pairs[giver];
      delete taken[r];
    }
    return false;
  }
  return place(0) ? pairs : null;
}

function draw(ids, exclusions, random) {
  random = random || Math.random;
  ids = ids.filter((id, i) => id && ids.indexOf(id) === i);
  if (ids.length < 3) return { error: "too_few" };

  const blocked = blockedPairs(ids, exclusions);
  const stuck = ids.filter((id) => ids.every((x) => blocked[id][x]));
  if (stuck.length) return { error: "no_options", ids: stuck };

  const pairs = (ids.length >= 4 && search(ids, blocked, true, random)) || search(ids, blocked, false, random);
  return pairs ? { pairs } : { error: "impossible" };
}

module.exports = { draw };
