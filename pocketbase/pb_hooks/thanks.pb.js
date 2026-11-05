/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// After the occasion: if the owner turned on "show me who gave what" (friends are
// told on the list), they can see who reserved or chipped in on each gift once the
// list's date has passed, for thank-you notes.
// ---------------------------------------------------------------------------
routerAdd(
  "GET",
  "/api/giftlist/lists/{id}/givers",
  (e) => {
    let list;
    try {
      list = e.app.findRecordById("lists", e.request.pathValue("id"));
    } catch (_) {
      list = null;
    }
    if (!list || !require(`${__hooks}/lib/util.js`).ownsList(list, e.auth.id)) throw new NotFoundError("This list doesn't exist, or it belongs to someone else.");
    if (!list.getBool("reveal_givers")) {
      throw new BadRequestError("Turn on “Show me who gave what after the date” in the list settings first.");
    }
    const date = list.getString("event_date").slice(0, 10);
    const now = new Date();
    const pad = (n) => (n < 10 ? "0" : "") + n;
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (!date || date >= today) throw new BadRequestError("You'll see who gave what the day after the list's date.");

    const out = [];
    for (const it of e.app.findRecordsByFilter("items", "list = {:list}", "sort,created", 0, 0, { list: list.id })) {
      const givers = [];
      for (const r of e.app.findRecordsByFilter("reservations", "item = {:id}", "", 0, 0, { id: it.id })) givers.push(r.getString("reserver_name") || "A friend");
      for (const p of e.app.findRecordsByFilter("pledges", "item = {:id}", "created", 0, 0, { id: it.id })) givers.push(p.getString("reserver_name") || "A friend");
      if (givers.length || it.getBool("received")) out.push({ item: it.id, name: it.getString("name"), givers, received: it.getBool("received"), thanked: it.getBool("thanked") });
    }
    return e.json(200, out);
  },
  $apis.requireAuth()
);
