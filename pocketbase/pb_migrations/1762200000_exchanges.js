/// <reference path="../pb_data/types.d.ts" />

// Secret Santa / gift exchanges.
//
// - exchanges: one per group. The organizer (owner) invites people with a join
//   link (`join_token`) or by email, then draws names.
// - exchange_members: everyone in the exchange. `recipient` (who they give to)
//   is a hidden field and members are only reachable through the custom routes
//   in pb_hooks, so nobody — not even the organizer — can look up the pairings.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const lists = app.findCollectionByNameOrId("lists");

  const isMember = "exchange_members_via_exchange.user ?= @request.auth.id";
  const exchanges = new Collection({
    type: "base",
    name: "exchanges",
    // the back-relation rules are set below, once exchange_members exists
    listRule: "owner = @request.auth.id",
    viewRule: "owner = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id && @request.body.status:isset = false',
    updateRule:
      "owner = @request.auth.id && @request.body.owner:isset = false && @request.body.status:isset = false && @request.body.join_token:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 100 },
      { type: "date", name: "event_date" },
      { type: "number", name: "budget", min: 0, max: 100000 },
      { type: "text", name: "currency", max: 3, pattern: "^([A-Z]{3})?$" },
      { type: "text", name: "message", max: 1000 },
      { type: "select", name: "status", maxSelect: 1, values: ["open", "drawn"] },
      { type: "date", name: "drawn_at" },
      {
        type: "text",
        name: "join_token",
        required: true,
        min: 16,
        max: 64,
        pattern: "^[a-zA-Z0-9]+$",
        autogeneratePattern: "[a-zA-Z0-9]{24}",
      },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_exchanges_join_token ON exchanges (join_token)"],
  });
  app.save(exchanges);

  const members = new Collection({
    type: "base",
    name: "exchange_members",
    // superusers only: everything goes through /api/giftlist/exchanges/… routes
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "exchange", required: true, collectionId: exchanges.id, maxSelect: 1, cascadeDelete: true },
      // empty until an emailed invitee joins
      { type: "relation", name: "user", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", max: 100 },
      { type: "email", name: "email" },
      // the wish list this person wants their Secret Santa to see
      { type: "relation", name: "list", collectionId: lists.id, maxSelect: 1, cascadeDelete: false },
      // people this member must not draw (and who must not draw them), e.g. partners
      { type: "json", name: "exclusions", maxSize: 4000 },
      { type: "text", name: "recipient", max: 30, hidden: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_exchange_members_user ON exchange_members (exchange, user) WHERE user != ''",
      "CREATE UNIQUE INDEX idx_exchange_members_email ON exchange_members (exchange, email) WHERE email != ''",
    ],
  });
  app.save(members);

  exchanges.listRule = `owner = @request.auth.id || ${isMember}`;
  exchanges.viewRule = `owner = @request.auth.id || ${isMember}`;
  app.save(exchanges);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("exchange_members"));
  app.delete(app.findCollectionByNameOrId("exchanges"));
});
