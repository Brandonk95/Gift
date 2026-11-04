/// <reference path="../pb_data/types.d.ts" />

// items.goes_with: another gift on the same list that this one goes with, like a
// case that only works with the earbuds. Friends see the two are linked; nobody
// has to buy both.
migrate(
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.add(new RelationField({ name: "goes_with", collectionId: items.id, maxSelect: 1, cascadeDelete: false }));
    app.save(items);
  },
  (app) => {
    const items = app.findCollectionByNameOrId("items");
    items.fields.removeByName("goes_with");
    app.save(items);
  },
);
