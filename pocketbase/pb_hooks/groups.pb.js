/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Family groups (see lib/groups.js): members see each other's shared lists.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/lib/util.js`);
  if (e.auth) e.record.set("owner_name", u.displayName(e.auth));
  e.next();
}, "groups");

// whoever makes a group is its first member
onRecordAfterCreateSuccess((e) => {
  e.next();
  try {
    const owner = e.app.findRecordById("users", e.record.getString("owner"));
    require(`${__hooks}/lib/groups.js`).addMember(e.app, e.record, owner);
  } catch (err) {
    console.log("[giftlist] adding group owner failed:", err);
  }
}, "groups");

// deleting a group: its follows go with it (cascade), then anything another
// shared group still connects is put back
onRecordDeleteRequest((e) => {
  const ids = e.app.findRecordsByFilter("group_members", "group = {:g}", "", 0, 0, { g: e.record.id }).map((m) => m.getString("user"));
  e.next();
  const groups = require(`${__hooks}/lib/groups.js`);
  for (const id of ids) {
    try {
      groups.syncUser(e.app, id);
    } catch (err) {
      console.log("[giftlist] group resync failed:", err);
    }
  }
}, "groups");

// leaving, or the owner removing someone
onRecordDeleteRequest((e) => {
  const groupId = e.record.getString("group");
  const userId = e.record.getString("user");
  const group = e.app.findRecordById("groups", groupId);
  if (group.getString("owner") === userId) {
    throw new BadRequestError("You made this group, so you can't leave it. Delete the group instead, or keep it.");
  }
  const others = e.app.findRecordsByFilter("group_members", "group = {:g} && user != {:u}", "", 0, 0, { g: groupId, u: userId }).map((m) => m.getString("user"));
  e.next();
  try {
    require(`${__hooks}/lib/groups.js`).unsync(e.app, userId, groupId, others);
  } catch (err) {
    console.log("[giftlist] leaving group cleanup failed:", err);
  }
}, "group_members");

// new lists, and lists made public or restored, reach the owner's group mates
onRecordAfterCreateSuccess((e) => {
  e.next();
  try {
    require(`${__hooks}/lib/groups.js`).shareList(e.app, e.record);
  } catch (err) {
    console.log("[giftlist] sharing new list with groups failed:", err);
  }
}, "lists");

onRecordAfterUpdateSuccess((e) => {
  e.next();
  const o = e.record.original();
  const changed =
    o.getBool("private") !== e.record.getBool("private") ||
    o.getBool("archived") !== e.record.getBool("archived") ||
    o.getString("share_token") !== e.record.getString("share_token");
  if (!changed) return;
  try {
    require(`${__hooks}/lib/groups.js`).listChanged(e.app, e.record);
  } catch (err) {
    console.log("[giftlist] updating group follows failed:", err);
  }
}, "lists");

// keep member names and pictures current
onRecordAfterUpdateSuccess((e) => {
  e.next();
  const u = require(`${__hooks}/lib/util.js`);
  const name = u.displayName(e.record);
  const hash = e.record.getString("email_hash");
  try {
    for (const m of e.app.findRecordsByFilter("group_members", "user = {:u} && (name != {:n} || email_hash != {:h})", "", 0, 0, { u: e.record.id, n: name, h: hash })) {
      m.set("name", name);
      m.set("email_hash", hash);
      e.app.save(m);
    }
    for (const g of e.app.findRecordsByFilter("groups", "owner = {:u} && owner_name != {:n}", "", 0, 0, { u: e.record.id, n: name })) {
      g.set("owner_name", name);
      e.app.save(g);
    }
  } catch (err) {
    console.log("[giftlist] group name sync failed:", err);
  }
}, "users");

// What an invite link shows before you join (works signed out, so the page can say
// what you're joining before asking you to sign in)
routerAdd("GET", "/api/giftlist/groups/invite/{token}", (e) => {
  let group;
  try {
    group = e.app.findFirstRecordByFilter("groups", "invite_token = {:t}", { t: e.request.pathValue("token") });
  } catch (_) {
    throw new NotFoundError("This invite link doesn't work anymore. Ask whoever sent it for a new one.");
  }
  const members = e.app.findRecordsByFilter("group_members", "group = {:g}", "created", 0, 0, { g: group.id });
  const me = e.auth ? members.some((m) => m.getString("user") === e.auth.id) : false;
  return e.json(200, {
    id: me ? group.id : "",
    name: group.getString("name"),
    emoji: group.getString("emoji"),
    owner_name: group.getString("owner_name"),
    members: members.length,
    names: members.slice(0, 6).map((m) => m.getString("name")),
    member: me,
  });
});

routerAdd(
  "POST",
  "/api/giftlist/groups/join",
  (e) => {
    const body = e.requestInfo().body || {};
    let group;
    try {
      group = e.app.findFirstRecordByFilter("groups", "invite_token = {:t}", { t: String(body.token || "") });
    } catch (_) {
      throw new NotFoundError("This invite link doesn't work anymore. Ask whoever sent it for a new one.");
    }
    const count = e.app.findRecordsByFilter("group_members", "group = {:g}", "", 0, 0, { g: group.id }).length;
    if (count >= 100) throw new BadRequestError("This group is full (100 people).");
    const user = e.app.findRecordById("users", e.auth.id);
    const r = require(`${__hooks}/lib/groups.js`).addMember(e.app, group, user);
    return e.json(200, { id: group.id, joined: r.joined });
  },
  $apis.requireAuth()
);

// new invite link (the old one stops working); people already in stay in
routerAdd(
  "POST",
  "/api/giftlist/groups/{id}/reset-invite",
  (e) => {
    let group;
    try {
      group = e.app.findRecordById("groups", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("This group no longer exists.");
    }
    if (group.getString("owner") !== e.auth.id) throw new ForbiddenError("Only the person who made the group can change its invite link.");
    group.set("invite_token", $security.randomStringWithAlphabet(24, "abcdefghijklmnopqrstuvwxyz0123456789"));
    e.app.save(group);
    return e.json(200, { invite_token: group.getString("invite_token") });
  },
  $apis.requireAuth()
);
