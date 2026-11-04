/// <reference path="../pb_data/types.d.ts" />

// follows.notify: the user pressed "Follow" on a shared list and wants a nightly email
// with the gifts added since the last one. notified_at is that cursor, set by hooks.
const LOCKED = "@request.body.notified_at:isset = false";

migrate((app) => {
  const follows = app.findCollectionByNameOrId("follows");
  follows.fields.add(new BoolField({ name: "notify" }));
  follows.fields.add(new DateField({ name: "notified_at" }));
  follows.createRule = `(${String(follows.createRule)}) && ${LOCKED}`;
  follows.updateRule = `(${String(follows.updateRule)}) && ${LOCKED}`;
  app.save(follows);
}, (app) => {
  const follows = app.findCollectionByNameOrId("follows");
  follows.fields.removeByName("notify");
  follows.fields.removeByName("notified_at");
  for (const k of ["createRule", "updateRule"]) {
    const rule = String(follows[k]);
    if (rule.endsWith(` && ${LOCKED}`)) follows[k] = rule.slice(1, -(` && ${LOCKED}`.length + 1));
  }
  app.save(follows);
});
