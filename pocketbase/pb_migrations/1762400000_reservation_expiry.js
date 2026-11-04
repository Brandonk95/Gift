/// <reference path="../pb_data/types.d.ts" />

// Reservations last a week unless the person who made them renews them (or marks the
// gift bought). `expires` and `reminded` are managed by hooks, never by clients.
const LOCKED = "@request.body.expires:isset = false && @request.body.reminded:isset = false";

migrate((app) => {
  const res = app.findCollectionByNameOrId("reservations");
  res.fields.add(new DateField({ name: "expires" }));
  res.fields.add(new BoolField({ name: "reminded" }));
  res.updateRule = `(${String(res.updateRule)}) && ${LOCKED}`;
  app.save(res);

  // give existing reservations a fresh week
  const expires = new Date(Date.now() + 7 * 864e5).toISOString().replace("T", " ");
  app.db().newQuery("UPDATE reservations SET expires = {:expires}, reminded = FALSE WHERE purchased = FALSE").bind({ expires }).execute();
}, (app) => {
  const res = app.findCollectionByNameOrId("reservations");
  res.fields.removeByName("expires");
  res.fields.removeByName("reminded");
  const rule = String(res.updateRule);
  if (rule.endsWith(` && ${LOCKED}`)) res.updateRule = rule.slice(1, -(` && ${LOCKED}`.length + 1));
  app.save(res);
});
