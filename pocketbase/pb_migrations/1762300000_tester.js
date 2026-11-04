/// <reference path="../pb_data/types.d.ts" />

// users.tester: set from the admin dashboard only. A tester sees their own share links
// the way friends do (reservations included) and can reserve their own gifts, so the
// whole flow can be tried with one account.
const SELF_EDIT = "@request.body.tester:isset = false";
const RES_VIEW_OLD = "item.list.owner != @request.auth.id && item.list.share_token = @request.headers.x_share_token";
const RES_VIEW_NEW = "(item.list.owner != @request.auth.id || @request.auth.tester = true) && item.list.share_token = @request.headers.x_share_token";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new BoolField({ name: "tester" }));
  // people can't make themselves testers (superusers skip these rules)
  // rules come through as Go values, so turn them into plain strings ("" = anyone, null = superusers only)
  const create = users.createRule == null ? null : String(users.createRule);
  const update = users.updateRule == null ? null : String(users.updateRule);
  if (create !== null) users.createRule = create ? `(${create}) && ${SELF_EDIT}` : SELF_EDIT;
  if (update) users.updateRule = `(${update}) && ${SELF_EDIT}`;
  app.save(users);

  const res = app.findCollectionByNameOrId("reservations");
  for (const k of ["listRule", "viewRule", "createRule"]) res[k] = String(res[k]).replace(RES_VIEW_OLD, RES_VIEW_NEW);
  app.save(res);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("tester");
  const strip = (rule) => {
    if (rule == null) return rule;
    rule = String(rule);
    if (rule === SELF_EDIT) return "";
    return rule.endsWith(` && ${SELF_EDIT}`) ? rule.slice(1, -(` && ${SELF_EDIT}`.length + 1)) : rule;
  };
  users.createRule = strip(users.createRule);
  users.updateRule = strip(users.updateRule);
  app.save(users);

  const res = app.findCollectionByNameOrId("reservations");
  for (const k of ["listRule", "viewRule", "createRule"]) res[k] = String(res[k]).replace(RES_VIEW_NEW, RES_VIEW_OLD);
  app.save(res);
});
