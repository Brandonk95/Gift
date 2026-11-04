/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// "Goes with": a gift can point at another gift on the same list (a case that
// only works with the earbuds). It's a heads-up for friends, not a rule.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/bundles.js`).checkGoesWith(e);
  e.next();
}, "items");

onRecordUpdateRequest((e) => {
  const moved = e.record.original().getString("list") !== e.record.getString("list");
  // moved to another list: its link, and links to it, can't follow it
  if (moved) e.record.set("goes_with", "");
  require(`${__hooks}/lib/bundles.js`).checkGoesWith(e);
  e.next();
  if (!moved) return;
  try {
    for (const r of e.app.findRecordsByFilter("items", "goes_with = {:id}", "", 0, 0, { id: e.record.id })) {
      r.set("goes_with", "");
      e.app.save(r);
    }
  } catch (err) {
    console.log("[giftlist] clearing goes_with links failed:", err);
  }
}, "items");
