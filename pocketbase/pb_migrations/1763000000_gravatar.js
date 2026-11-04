/// <reference path="../pb_data/types.d.ts" />

// users.email_hash: SHA-256 of the email, so the app can show the person's Gravatar
// when they haven't uploaded a picture. Kept up to date by users.pb.js, never set by
// people themselves, and (like the rest of a user record) only visible to its owner.
const LOCK = "@request.body.email_hash:isset = false";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "email_hash", max: 64 }));
  const create = users.createRule == null ? null : String(users.createRule);
  const update = users.updateRule == null ? null : String(users.updateRule);
  if (create !== null) users.createRule = create ? `(${create}) && ${LOCK}` : LOCK;
  if (update) users.updateRule = `(${update}) && ${LOCK}`;
  app.save(users);

  // fill it in for everyone who already has an account
  for (const u of app.findAllRecords("users")) {
    u.set("email_hash", $security.sha256(String(u.email()).trim().toLowerCase()));
    app.saveNoValidate(u);
  }
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("email_hash");
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
