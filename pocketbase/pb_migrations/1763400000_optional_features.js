/// <reference path="../pb_data/types.d.ts" />

// The list owner can turn off "chip in together" and anonymous questions on a list.
// Both stay on unless switched off, so existing lists keep working as before.
migrate(
  (app) => {
    const lists = app.findCollectionByNameOrId("lists");
    lists.fields.add(new BoolField({ name: "no_chip_in" }));
    lists.fields.add(new BoolField({ name: "no_questions" }));
    app.save(lists);
  },
  (app) => {
    const lists = app.findCollectionByNameOrId("lists");
    for (const name of ["no_chip_in", "no_questions"]) lists.fields.removeByName(name);
    app.save(lists);
  },
);
