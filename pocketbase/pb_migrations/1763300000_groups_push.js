/// <reference path="../pb_data/types.d.ts" />

// Family groups and phone notifications.
//
// - groups / group_members: make a group once ("Family"), invite people with its
//   link, and everyone's shared lists show up on everyone's dashboard. That works
//   through ordinary follows (see lib/groups.js): follows.via_group marks the ones a
//   group added, so leaving the group takes them away again.
// - push_subs: each phone or browser that turned on notifications (Web Push).
// - users.push_prefs: notification kinds a person turned off ({ digest: false, ... }).
// - secrets: server-only values (the Web Push signing key). No API access.
const FOLLOW_LOCK = "@request.body.via_group:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const groups = new Collection({
    type: "base",
    name: "groups",
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id && @request.body.invite_token:isset = false',
    updateRule: "owner = @request.auth.id && @request.body.owner:isset = false && @request.body.invite_token:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 60 },
      { type: "text", name: "emoji", max: 16 },
      { type: "text", name: "owner_name", max: 100 },
      { type: "text", name: "invite_token", max: 40, autogeneratePattern: "[a-z0-9]{24}" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_groups_invite ON groups (invite_token)"],
  });
  app.save(groups);

  const members = new Collection({
    type: "base",
    name: "group_members",
    listRule: "group.owner = @request.auth.id || group.group_members_via_group.user ?= @request.auth.id",
    viewRule: "group.owner = @request.auth.id || group.group_members_via_group.user ?= @request.auth.id",
    createRule: null, // joining goes through /api/giftlist/groups/join
    updateRule: null,
    deleteRule: "user = @request.auth.id || group.owner = @request.auth.id",
    fields: [
      { type: "relation", name: "group", required: true, collectionId: groups.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", max: 100 },
      { type: "text", name: "email_hash", max: 64 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_group_members ON group_members (`group`, user)"],
  });
  app.save(members);

  const isMember = "group_members_via_group.user ?= @request.auth.id";
  groups.listRule = `owner = @request.auth.id || ${isMember}`;
  groups.viewRule = `owner = @request.auth.id || ${isMember}`;
  app.save(groups);

  const follows = app.findCollectionByNameOrId("follows");
  follows.fields.add(new RelationField({ name: "via_group", collectionId: groups.id, maxSelect: 1, cascadeDelete: true }));
  follows.createRule = `(${String(follows.createRule)}) && ${FOLLOW_LOCK}`;
  follows.updateRule = `(${String(follows.updateRule)}) && ${FOLLOW_LOCK}`;
  app.save(follows);

  const subs = new Collection({
    type: "base",
    name: "push_subs",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: null,
    deleteRule: "user = @request.auth.id",
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "endpoint", required: true, max: 1000 },
      { type: "text", name: "p256dh", required: true, max: 200 },
      { type: "text", name: "auth", required: true, max: 100 },
      { type: "text", name: "label", max: 100 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_push_subs_endpoint ON push_subs (endpoint)"],
  });
  app.save(subs);

  const secrets = new Collection({
    type: "base",
    name: "secrets",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "text", name: "key", required: true, max: 50 },
      { type: "text", name: "value", required: true, max: 2000, hidden: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_secrets_key ON secrets (key)"],
  });
  app.save(secrets);

  users.fields.add(new JSONField({ name: "push_prefs", maxSize: 2000 }));
  app.save(users);
}, (app) => {
  for (const name of ["secrets", "push_subs"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
  const follows = app.findCollectionByNameOrId("follows");
  follows.fields.removeByName("via_group");
  for (const k of ["createRule", "updateRule"]) {
    const rule = String(follows[k]);
    if (rule.endsWith(` && ${FOLLOW_LOCK}`)) follows[k] = rule.slice(1, -(` && ${FOLLOW_LOCK}`.length + 1));
  }
  app.save(follows);
  for (const name of ["group_members", "groups"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("push_prefs");
  app.save(users);
});
