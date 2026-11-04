/// <reference path="../pb_data/types.d.ts" />

// Initial schema for the gift list app.
//
// Sharing model: every list has a random `share_token`. Friends get access by
// sending it in the `X-Share-Token` header (the SPA does this when a share link
// is opened). The list owner never sees reservations, so surprises stay surprises.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // ---------------------------------------------------------------- categories
  const categories = new Collection({
    type: "base",
    name: "categories",
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: "owner = @request.auth.id",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { type: "text", name: "name", required: true, max: 60 },
      { type: "text", name: "icon", max: 16 },
      // empty owner = built-in category available to everyone
      { type: "relation", name: "owner", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(categories);

  // --------------------------------------------------------------------- lists
  const lists = new Collection({
    type: "base",
    name: "lists",
    listRule: "owner = @request.auth.id || share_token = @request.headers.x_share_token",
    viewRule: "owner = @request.auth.id || share_token = @request.headers.x_share_token",
    createRule: '@request.auth.id != "" && @request.body.owner = @request.auth.id',
    updateRule: "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "owner_name", max: 100 },
      { type: "text", name: "title", required: true, max: 120 },
      { type: "text", name: "description", max: 2000 },
      {
        type: "select",
        name: "occasion",
        maxSelect: 1,
        values: ["christmas", "birthday", "wedding", "baby", "graduation", "anniversary", "other"],
      },
      { type: "date", name: "event_date" },
      {
        type: "text",
        name: "share_token",
        required: true,
        min: 16,
        max: 64,
        pattern: "^[a-zA-Z0-9]+$",
        autogeneratePattern: "[a-zA-Z0-9]{24}",
      },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_lists_share_token ON lists (share_token)"],
  });
  app.save(lists);

  // --------------------------------------------------------------------- items
  const itemAccess = "list.owner = @request.auth.id || list.share_token = @request.headers.x_share_token";
  const items = new Collection({
    type: "base",
    name: "items",
    listRule: itemAccess,
    viewRule: itemAccess,
    createRule: '@request.auth.id != "" && list.owner = @request.auth.id',
    updateRule: "list.owner = @request.auth.id && (@request.body.list:isset = false || @request.body.list = list)",
    deleteRule: "list.owner = @request.auth.id",
    fields: [
      { type: "relation", name: "list", required: true, collectionId: lists.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 200 },
      { type: "text", name: "description", max: 3000 },
      { type: "url", name: "url" },
      { type: "number", name: "price", min: 0 },
      { type: "number", name: "quantity", min: 1, onlyInt: true },
      { type: "select", name: "priority", maxSelect: 1, values: ["high", "medium", "low"] },
      { type: "relation", name: "category", collectionId: categories.id, maxSelect: 1 },
      {
        type: "file",
        name: "image",
        maxSelect: 1,
        maxSize: 5 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
        thumbs: ["400x400f"],
      },
      { type: "url", name: "image_url" },
      { type: "number", name: "sort", onlyInt: true },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(items);

  // -------------------------------------------------------------- reservations
  const reservations = new Collection({
    type: "base",
    name: "reservations",
    listRule:
      "user = @request.auth.id || (item.list.owner != @request.auth.id && item.list.share_token = @request.headers.x_share_token)",
    viewRule:
      "user = @request.auth.id || (item.list.owner != @request.auth.id && item.list.share_token = @request.headers.x_share_token)",
    createRule:
      '@request.auth.id != "" && @request.body.user = @request.auth.id && item.list.owner != @request.auth.id && item.list.share_token = @request.headers.x_share_token',
    updateRule: null,
    deleteRule: "user = @request.auth.id",
    fields: [
      { type: "relation", name: "item", required: true, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      // filled server side so other friends can coordinate without exposing user records
      { type: "text", name: "reserver_name", max: 100 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reservations_item ON reservations (item)"],
  });
  app.save(reservations);

  // ------------------------------------------------------------------- follows
  // Shared lists a user has opened, so they show up on their dashboard.
  const follows = new Collection({
    type: "base",
    name: "follows",
    listRule: "user = @request.auth.id",
    viewRule: "user = @request.auth.id",
    createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
    updateRule: "user = @request.auth.id && (@request.body.user:isset = false || @request.body.user = @request.auth.id)",
    deleteRule: "user = @request.auth.id",
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "list", required: true, collectionId: lists.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "token", required: true, max: 64 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_follows_user_list ON follows (user, list)"],
  });
  app.save(follows);

  // ---------------------------------------------------- default categories
  const defaults = [
    ["Electronics", "🎧"],
    ["Books", "📚"],
    ["Clothing", "👕"],
    ["Toys & Games", "🧸"],
    ["Home & Kitchen", "🏠"],
    ["Beauty", "💄"],
    ["Sports & Outdoors", "⚽"],
    ["Experiences", "🎟️"],
    ["Gift Cards", "💳"],
    ["Other", "🎁"],
  ];
  for (const [name, icon] of defaults) {
    const r = new Record(categories);
    r.set("name", name);
    r.set("icon", icon);
    app.save(r);
  }
}, (app) => {
  for (const name of ["follows", "reservations", "items", "lists", "categories"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
});
