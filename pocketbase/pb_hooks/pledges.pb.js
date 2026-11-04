/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Chip in together: several friends split one gift. A gift is either reserved by
// one person or chipped in on by a group, never both. Like reservations, pledges
// are hidden from the list owner. The app only tracks who's in and how much;
// friends sort out paying each other themselves.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  const { displayName } = require(`${__hooks}/lib/util.js`);
  if (e.auth) e.record.set("reserver_name", displayName(e.auth));
  const item = e.record.getString("item");
  // Turned off on this list: no new groups, but friends can still join one that already started.
  if (item && !e.app.findRecordsByFilter("pledges", "item = {:item}", "", 1, 0, { item }).length) {
    let list = null;
    try {
      list = e.app.findRecordById("lists", e.app.findRecordById("items", item).getString("list"));
    } catch (_) {}
    if (list && list.getBool("no_chip_in")) throw new BadRequestError("This list doesn't use chipping in together. You can still reserve the gift yourself.");
  }
  if (item && e.app.findRecordsByFilter("reservations", "item = {:item}", "", 1, 0, { item }).length) {
    throw new BadRequestError("Someone already reserved this gift on their own, so there's nothing to chip in on.");
  }
  e.next();
}, "pledges");

onRecordCreateRequest((e) => {
  const item = e.record.getString("item");
  if (item && e.app.findRecordsByFilter("pledges", "item = {:item}", "", 1, 0, { item }).length) {
    throw new BadRequestError("Friends are chipping in together on this gift. Join them with “Chip in” instead of reserving it alone.");
  }
  e.next();
}, "reservations");
