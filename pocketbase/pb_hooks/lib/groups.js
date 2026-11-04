// Family groups: everyone in a group sees everyone else's shared lists.
//
// It works through ordinary follows, so dashboards, digests and reminders need no
// changes: for every pair of group mates, each follows the other's lists (not
// private ideas boards or archived lists). follows.via_group remembers which group
// added a follow; leaving the group removes those again, unless another group
// the two people share still connects them. Follows people made themselves (by
// opening a share link) are never touched.

// userId → { mateId: groupId } for every person sharing a group with them
function mates(app, userId) {
  const out = {};
  for (const m of app.findRecordsByFilter("group_members", "user = {:u}", "created", 0, 0, { u: userId })) {
    const g = m.getString("group");
    for (const other of app.findRecordsByFilter("group_members", "group = {:g} && user != {:u}", "created", 0, 0, { g, u: userId })) {
      const id = other.getString("user");
      if (!out[id]) out[id] = g;
    }
  }
  return out;
}

const shareable = (list) => !list.getBool("private") && !list.getBool("archived");

// make sure `userId` follows `list` (added by group `groupId`)
function ensureFollow(app, userId, list, groupId) {
  const u = require(`${__hooks}/lib/util.js`);
  const token = list.getString("share_token");
  let existing = null;
  try {
    existing = app.findFirstRecordByFilter("follows", "user = {:u} && list = {:l}", { u: userId, l: list.id });
  } catch (_) {}
  if (existing) {
    // a group follow keeps working when the owner resets the share link
    if (existing.getString("via_group") && existing.getString("token") !== token) {
      existing.set("token", token);
      app.save(existing);
    }
    return false;
  }
  const f = new Record(app.findCollectionByNameOrId("follows"));
  f.set("user", userId);
  f.set("list", list.id);
  f.set("token", token);
  f.set("via_group", groupId);
  f.set("notify", true); // nightly "new gifts" note; people can turn it off per list
  f.set("notified_at", u.pbDate(Date.now()));
  app.save(f);
  return true;
}

function listsOf(app, ownerId) {
  return app.findRecordsByFilter("lists", "owner = {:o} && private = false && archived = false", "", 0, 0, { o: ownerId });
}

// connect `userId` with all their group mates, both ways
function syncUser(app, userId) {
  const m = mates(app, userId);
  const mine = listsOf(app, userId);
  let added = 0;
  for (const mateId in m) {
    for (const l of listsOf(app, mateId)) if (ensureFollow(app, userId, l, m[mateId])) added++;
    for (const l of mine) if (ensureFollow(app, mateId, l, m[mateId])) added++;
  }
  return added;
}

// a list became visible (created, made public, restored): give it to the owner's mates
function shareList(app, list) {
  if (!shareable(list)) return;
  const m = mates(app, list.getString("owner"));
  for (const mateId in m) ensureFollow(app, mateId, list, m[mateId]);
}

// keep group follows of a list in step with it (new share link, now private)
function listChanged(app, list) {
  const follows = app.findRecordsByFilter("follows", "list = {:l} && via_group != ''", "", 0, 0, { l: list.id });
  for (const f of follows) {
    if (list.getBool("private")) app.delete(f);
    else if (f.getString("token") !== list.getString("share_token")) {
      f.set("token", list.getString("share_token"));
      app.save(f);
    }
  }
  shareList(app, list);
}

// `userId` left (or was removed from) group `groupId`, whose other members are `others`
function unsync(app, userId, groupId, others) {
  for (const other of others) {
    const pairs = app.findRecordsByFilter(
      "follows",
      "via_group = {:g} && ((user = {:a} && list.owner = {:b}) || (user = {:b} && list.owner = {:a}))",
      "",
      0,
      0,
      { g: groupId, a: userId, b: other }
    );
    for (const f of pairs) app.delete(f);
  }
  // put back whatever another shared group still connects
  syncUser(app, userId);
}

function addMember(app, group, user) {
  const u = require(`${__hooks}/lib/util.js`);
  try {
    return { member: app.findFirstRecordByFilter("group_members", "group = {:g} && user = {:u}", { g: group.id, u: user.id }), joined: false };
  } catch (_) {}
  const m = new Record(app.findCollectionByNameOrId("group_members"));
  m.set("group", group.id);
  m.set("user", user.id);
  m.set("name", u.displayName(user));
  m.set("email_hash", user.getString("email_hash"));
  app.save(m);
  syncUser(app, user.id);
  return { member: m, joined: true };
}

module.exports = { mates, syncUser, shareList, listChanged, unsync, addMember };
