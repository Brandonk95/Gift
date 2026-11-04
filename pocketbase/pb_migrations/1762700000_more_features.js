/// <reference path="../pb_data/types.d.ts" />

// - users.email_prefs: optional emails a person turned off ({ digest: false, ... })
// - follows.occasion_reminded: the event date we last sent a "coming up" reminder for
// - pledges: friends chipping in together on one gift (hidden from the owner, like reservations)
// - questions: anonymous questions friends ask the list owner, answered on the list
// - lists.reveal_givers / items.thanked: after the occasion, the owner sees who gave what and ticks off thank-yous
// - items.current_price / price_checked / price_alerted: weekly price checks of gift links
// - exchanges.revealed + exchange_messages: Secret Santa reveal and anonymous messages
const REVEAL_LOCK = "@request.body.revealed:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new JSONField({ name: "email_prefs", maxSize: 2000 }));
  app.save(users);

  const follows = app.findCollectionByNameOrId("follows");
  follows.fields.add(new TextField({ name: "occasion_reminded", max: 30 }));
  // set by the nightly job only
  follows.updateRule = `(${String(follows.updateRule)}) && @request.body.occasion_reminded:isset = false`;
  app.save(follows);

  const lists = app.findCollectionByNameOrId("lists");
  lists.fields.add(new BoolField({ name: "reveal_givers" }));
  app.save(lists);

  const items = app.findCollectionByNameOrId("items");
  items.fields.add(new BoolField({ name: "thanked" }));
  items.fields.add(new NumberField({ name: "current_price", min: 0 }));
  items.fields.add(new DateField({ name: "price_checked" }));
  items.fields.add(new NumberField({ name: "price_alerted", min: 0 }));
  const lock = ["current_price", "price_checked", "price_alerted"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  items.createRule = `(${String(items.createRule)}) && ${lock}`;
  items.updateRule = `(${String(items.updateRule)}) && ${lock}`;
  app.save(items);

  const users_ = users.id;
  const pledgeAccess =
    "user = @request.auth.id || ((item.list.owner != @request.auth.id || @request.auth.tester = true) && item.list.share_token = @request.headers.x_share_token)";
  const pledges = new Collection({
    type: "base",
    name: "pledges",
    listRule: pledgeAccess,
    viewRule: pledgeAccess,
    createRule:
      '@request.auth.id != "" && @request.body.user = @request.auth.id && (item.list.owner != @request.auth.id || @request.auth.tester = true) && item.list.share_token = @request.headers.x_share_token',
    updateRule: "user = @request.auth.id && @request.body.user:isset = false && @request.body.item:isset = false",
    deleteRule: "user = @request.auth.id",
    fields: [
      { type: "relation", name: "item", required: true, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "user", required: true, collectionId: users_, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "reserver_name", max: 100 },
      { type: "number", name: "amount", min: 0 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_pledges_item_user ON pledges (item, user)"],
  });
  app.save(pledges);

  const questions = new Collection({
    type: "base",
    name: "questions",
    listRule: "list.owner = @request.auth.id || list.share_token = @request.headers.x_share_token",
    viewRule: "list.owner = @request.auth.id || list.share_token = @request.headers.x_share_token",
    createRule:
      '@request.auth.id != "" && (list.owner != @request.auth.id || @request.auth.tester = true) && list.share_token = @request.headers.x_share_token && @request.body.answer:isset = false && @request.body.answered_at:isset = false',
    updateRule:
      "list.owner = @request.auth.id && @request.body.list:isset = false && @request.body.item:isset = false && @request.body.question:isset = false && @request.body.asker:isset = false && @request.body.answered_at:isset = false",
    deleteRule: "list.owner = @request.auth.id",
    fields: [
      { type: "relation", name: "list", required: true, collectionId: lists.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "item", collectionId: items.id, maxSelect: 1, cascadeDelete: true },
      // who asked stays secret from everyone (only used to email them the answer)
      { type: "relation", name: "asker", collectionId: users_, maxSelect: 1, hidden: true },
      { type: "text", name: "question", required: true, max: 500 },
      { type: "text", name: "answer", max: 1000 },
      { type: "date", name: "answered_at" },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
  });
  app.save(questions);

  const exchanges = app.findCollectionByNameOrId("exchanges");
  exchanges.fields.add(new BoolField({ name: "revealed" }));
  exchanges.createRule = `(${String(exchanges.createRule)}) && ${REVEAL_LOCK}`;
  exchanges.updateRule = `(${String(exchanges.updateRule)}) && ${REVEAL_LOCK}`;
  app.save(exchanges);

  const members = app.findCollectionByNameOrId("exchange_members");
  const messages = new Collection({
    type: "base",
    name: "exchange_messages",
    // only through the API routes, which keep the Santa anonymous
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "exchange", required: true, collectionId: exchanges.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "from", required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "to", required: true, collectionId: members.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "text", required: true, max: 1000 },
      { type: "autodate", name: "created", onCreate: true },
    ],
    indexes: ["CREATE INDEX idx_exchange_messages_pair ON exchange_messages (exchange, `from`, `to`)"],
  });
  app.save(messages);
}, (app) => {
  for (const name of ["exchange_messages", "questions", "pledges"]) app.delete(app.findCollectionByNameOrId(name));
  const strip = (rule, suffix) => {
    rule = String(rule);
    return rule.endsWith(` && ${suffix}`) ? rule.slice(1, -(` && ${suffix}`.length + 1)) : rule;
  };
  const drop = (name, fields) => {
    const c = app.findCollectionByNameOrId(name);
    for (const f of fields) c.fields.removeByName(f);
    return c;
  };
  const exchanges = drop("exchanges", ["revealed"]);
  exchanges.createRule = strip(exchanges.createRule, REVEAL_LOCK);
  exchanges.updateRule = strip(exchanges.updateRule, REVEAL_LOCK);
  app.save(exchanges);
  const items = drop("items", ["thanked", "current_price", "price_checked", "price_alerted"]);
  const lock = ["current_price", "price_checked", "price_alerted"].map((f) => `@request.body.${f}:isset = false`).join(" && ");
  items.createRule = strip(items.createRule, lock);
  items.updateRule = strip(items.updateRule, lock);
  app.save(items);
  app.save(drop("lists", ["reveal_givers"]));
  const follows = drop("follows", ["occasion_reminded"]);
  follows.updateRule = strip(follows.updateRule, "@request.body.occasion_reminded:isset = false");
  app.save(follows);
  app.save(drop("users", ["email_prefs"]));
});
