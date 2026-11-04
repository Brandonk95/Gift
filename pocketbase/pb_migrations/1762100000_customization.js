/// <reference path="../pb_data/types.d.ts" />

// Customization + convenience fields:
// - users.prefs: appearance settings (accent, theme, font, default view)
// - lists: color, cover emoji, currency, privacy toggles, archive flag
// - items: received flag (owner marks gifts they got; hidden from friends)
// - reservations: purchased flag so friends can track their shopping
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new JSONField({ name: "prefs", maxSize: 4000 }));
  app.save(users);

  const lists = app.findCollectionByNameOrId("lists");
  lists.fields.add(
    new SelectField({
      name: "color",
      maxSelect: 1,
      values: ["slate", "red", "orange", "amber", "green", "teal", "blue", "indigo", "violet", "pink"],
    })
  );
  lists.fields.add(new TextField({ name: "emoji", max: 16 }));
  lists.fields.add(new TextField({ name: "currency", max: 3, pattern: "^([A-Z]{3})?$" }));
  lists.fields.add(new BoolField({ name: "hide_prices" }));
  lists.fields.add(new BoolField({ name: "hide_reservers" }));
  lists.fields.add(new BoolField({ name: "archived" }));
  app.save(lists);

  const items = app.findCollectionByNameOrId("items");
  items.fields.add(new BoolField({ name: "received" }));
  items.fields.add(new TextField({ name: "size", max: 60 }));
  items.fields.add(new TextField({ name: "color", max: 60 }));
  // allow moving a gift between your own lists
  items.updateRule =
    "list.owner = @request.auth.id && (@request.body.list:isset = false || @request.body.list.owner = @request.auth.id)";
  app.save(items);

  const reservations = app.findCollectionByNameOrId("reservations");
  reservations.fields.add(new BoolField({ name: "purchased" }));
  reservations.updateRule =
    "user = @request.auth.id && @request.body.user:isset = false && @request.body.item:isset = false";
  app.save(reservations);
}, (app) => {
  const drop = (name, fields) => {
    const c = app.findCollectionByNameOrId(name);
    for (const f of fields) c.fields.removeByName(f);
    return c;
  };
  app.save(drop("users", ["prefs"]));
  app.save(drop("lists", ["color", "emoji", "currency", "hide_prices", "hide_reservers", "archived"]));
  const items = drop("items", ["received", "size", "color"]);
  items.updateRule = "list.owner = @request.auth.id && (@request.body.list:isset = false || @request.body.list = list)";
  app.save(items);
  const res = drop("reservations", ["purchased"]);
  res.updateRule = null;
  app.save(res);
});
