/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Two owners on one list. The owner makes an invite link (/o/{token}); whoever
// opens it and accepts becomes the co-owner. Either of them can end it: the owner
// removes the co-owner, or the co-owner leaves. Rules: see 1763600000_co_owner.js.
// ---------------------------------------------------------------------------

// the owner makes (or remakes) the invite link; the old one stops working
routerAdd(
  "POST",
  "/api/giftlist/lists/{id}/co-owner/invite",
  (e) => {
    let list;
    try {
      list = e.app.findRecordById("lists", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("This list no longer exists. It may have been deleted. Refresh the page.");
    }
    if (list.getString("owner") !== e.auth.id) throw new ForbiddenError("Only the person who made the list can invite a co-owner.");
    if (list.getString("co_owner")) throw new BadRequestError(`${list.getString("co_owner_name") || "Someone"} already owns this list with you. Remove them first to invite someone else.`);
    const token = $security.randomStringWithAlphabet(24, "abcdefghijklmnopqrstuvwxyz0123456789");
    list.set("co_invite", token);
    e.app.save(list);
    return e.json(200, { token });
  },
  $apis.requireAuth()
);

// what the invite link shows before accepting (works signed out)
routerAdd("GET", "/api/giftlist/co-owner/{token}", (e) => {
  const list = require(`${__hooks}/lib/co_owner.js`).byInvite(e.app, e.request.pathValue("token"));
  const me = e.auth ? e.auth.id : "";
  return e.json(200, {
    // already one of its owners: the page goes straight to the list
    id: me && (list.getString("owner") === me || list.getString("co_owner") === me) ? list.id : "",
    title: list.getString("title"),
    emoji: list.getString("emoji"),
    occasion: list.getString("occasion"),
    owner_name: list.getString("owner_name"),
  });
});

routerAdd(
  "POST",
  "/api/giftlist/co-owner/{token}",
  (e) => {
    const { displayName } = require(`${__hooks}/lib/util.js`);
    const list = require(`${__hooks}/lib/co_owner.js`).byInvite(e.app, e.request.pathValue("token"));
    if (list.getString("owner") === e.auth.id) throw new BadRequestError("This is your own list. Send the invite link to the person you want to share it with.");
    if (list.getString("co_owner") && list.getString("co_owner") !== e.auth.id) {
      throw new BadRequestError("Someone else already accepted this invite.");
    }
    const user = e.app.findRecordById("users", e.auth.id);
    list.set("co_owner", user.id);
    list.set("co_owner_name", displayName(user));
    list.set("co_invite", "");
    e.app.save(list);
    return e.json(200, { id: list.id });
  },
  $apis.requireAuth()
);

// the owner removes the co-owner, or the co-owner leaves; also cancels an open invite
routerAdd(
  "POST",
  "/api/giftlist/lists/{id}/co-owner/remove",
  (e) => {
    let list;
    try {
      list = e.app.findRecordById("lists", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("This list no longer exists.");
    }
    const me = e.auth.id;
    if (list.getString("owner") !== me && list.getString("co_owner") !== me) {
      throw new ForbiddenError("Only the list's owners can change who owns it.");
    }
    list.set("co_owner", "");
    list.set("co_owner_name", "");
    list.set("co_invite", "");
    e.app.save(list);
    return e.json(200, { ok: true });
  },
  $apis.requireAuth()
);
