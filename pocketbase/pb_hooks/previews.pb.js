/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Link previews. When a list or group invite link is pasted into a chat app,
// the app fetches the page and shows a card from its og: tags. The web app is
// a single page, so these routes serve its index.html with the tags filled in.
// ---------------------------------------------------------------------------

routerAdd("GET", "/s/{token}", (e) => {
  const p = require(`${__hooks}/lib/previews.js`);
  const meta = { url: "/s/" + e.request.pathValue("token") };
  try {
    const list = e.app.findFirstRecordByData("lists", "share_token", e.request.pathValue("token"));
    if (!list.getBool("private")) {
      const owner = list.getString("owner_name");
      const n = e.app.countRecords("items", $dbx.exp("list = {:l} AND received = false", { l: list.id }));
      const date = p.longDate(list.getString("event_date"));
      meta.title = list.getString("title");
      meta.description = [owner ? `${owner}'s wish list` : "A wish list", `${n} gift${n === 1 ? "" : "s"}`, date].filter(Boolean).join(" · ");
      const cover = list.getString("cover");
      const theme = list.getString("theme");
      meta.image = cover ? `/api/files/lists/${list.id}/${encodeURIComponent(cover)}?thumb=1200x400` : `/og/${theme || "default"}.png`;
    }
  } catch (_) {
    // unknown link: the page itself explains
  }
  return p.page(e, meta);
});

routerAdd("GET", "/g/{token}", (e) => {
  const p = require(`${__hooks}/lib/previews.js`);
  const meta = { url: "/g/" + e.request.pathValue("token"), image: "/og/default.png" };
  try {
    const g = e.app.findFirstRecordByData("groups", "invite_token", e.request.pathValue("token"));
    const who = g.getString("owner_name");
    meta.title = `Join “${g.getString("name")}”`;
    meta.description = `${who || "Someone"} invited you to a group, so you can all see each other's wish lists.`;
  } catch (_) {}
  return p.page(e, meta);
});
