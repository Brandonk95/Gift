/// <reference path="../pb_data/types.d.ts" />

// users.origin: the address (e.g. https://gifts.example.com or http://192.168.1.20:8090)
// the person last used the app on, so emails sent later without a request to go by
// (reminders, digests, price alerts) link to an address that works for them. Set by
// the server only (see main.pb.js and lib/util.js appUrl); hidden from the API.
const LOCK = "@request.body.origin:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "origin", max: 300, hidden: true }));
  const create = users.createRule == null ? null : String(users.createRule);
  const update = users.updateRule == null ? null : String(users.updateRule);
  if (create !== null) users.createRule = create ? `(${create}) && ${LOCK}` : LOCK;
  if (update) users.updateRule = `(${update}) && ${LOCK}`;
  app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("origin");
  const strip = (rule) => {
    if (rule == null) return rule;
    rule = String(rule);
    if (rule === LOCK) return "";
    return rule.endsWith(` && ${LOCK}`) ? rule.slice(1, -(` && ${LOCK}`.length + 1)) : rule;
  };
  users.createRule = strip(users.createRule);
  users.updateRule = strip(users.updateRule);
  app.save(users);
});
