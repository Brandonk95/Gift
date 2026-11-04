/// <reference path="../pb_data/types.d.ts" />

// Removes users.origin, which a short-lived version used to send email links to
// whichever address each person was on (since undone: email links use APP_URL again).
// Does nothing on databases that never had the field.
const LOCK = "@request.body.origin:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("origin")) return;
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
}, () => {
  // nothing to restore
});
