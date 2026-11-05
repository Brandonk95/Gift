/// <reference path="../pb_data/types.d.ts" />

// Two owners on one list (a couple's wedding or baby list).
//
// - lists.co_owner: the second owner. They can add, edit and remove gifts, change
//   the list's settings and answer questions, and, like the owner, never see who
//   reserved or chipped in on what. Only the owner can delete the list or change
//   who co-owns it.
// - lists.co_owner_name: their display name, kept by the server (user records are private).
// - lists.co_invite: the invite link's token (server only, hidden from the API).
//
// Every rule that lets the owner in now lets the co-owner in too, and every rule
// that keeps the owner out of reservations keeps the co-owner out as well.
//
// Careful: signed out, @request.auth.id is "", and so is an empty co_owner. So
// "co_owner = me" also needs "I'm signed in", and "co_owner != me" also passes
// when there's no co-owner (or signed-out friends couldn't see what's taken).
const A = "@request.auth.id";
const IS_CO = (p) => `(${A} != "" && ${p}co_owner = ${A})`;
const NOT_CO = (p) => `(${p}co_owner = "" || ${p}co_owner != ${A})`;

const LIST_UPDATE_OLD = `owner = ${A} && (@request.body.owner:isset = false || @request.body.owner = ${A})`;
const LOCKED = "@request.body.co_owner:isset = false && @request.body.co_owner_name:isset = false && @request.body.co_invite:isset = false";
const LIST_UPDATE_NEW = `(owner = ${A} && (@request.body.owner:isset = false || @request.body.owner = ${A}) && ${LOCKED}) || (${IS_CO("")} && @request.body.owner:isset = false && ${LOCKED})`;

// [old, new] pairs, applied in order (the "!=" ones first)
const SWAPS = [
  [`item.list.owner != ${A}`, `(item.list.owner != ${A} && ${NOT_CO("item.list.")})`],
  [`list.owner != ${A}`, `(list.owner != ${A} && ${NOT_CO("list.")})`],
  [`@request.body.list.owner = ${A}`, `(@request.body.list.owner = ${A} || ${IS_CO("@request.body.list.")})`],
  [`item.list.owner = ${A}`, `(item.list.owner = ${A} || ${IS_CO("item.list.")})`],
];
const LIST_OWNER = [`list.owner = ${A}`, `(list.owner = ${A} || ${IS_CO("list.")})`];
const LIST_READ = [`owner = ${A} ||`, `owner = ${A} || ${IS_CO("")} ||`];

const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

// replace whole tokens only: "list.owner = X" must not match inside "item.list.owner = X"
// or "@request.body.list.owner = X", so those are swapped out first through placeholders
function swap(rule, pairs, single) {
  if (rule == null) return rule;
  let s = String(rule);
  const held = [];
  for (const [from, to] of pairs) {
    s = s.split(from).join(`\u0000${held.length}\u0000`);
    held.push(to);
  }
  if (single) {
    const [from, to] = single;
    s = s.replace(new RegExp(`(^|[^.\\w])${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), (m, pre) => pre + to);
  }
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => held[+i]);
}

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const lists = app.findCollectionByNameOrId("lists");
    lists.fields.add(new RelationField({ name: "co_owner", collectionId: users.id, maxSelect: 1, cascadeDelete: false }));
    lists.fields.add(new TextField({ name: "co_owner_name", max: 100 }));
    lists.fields.add(new TextField({ name: "co_invite", max: 40, hidden: true }));
    lists.listRule = String(lists.listRule).replace(LIST_READ[0], LIST_READ[1]);
    lists.viewRule = String(lists.viewRule).replace(LIST_READ[0], LIST_READ[1]);
    lists.createRule = `(${String(lists.createRule)}) && ${LOCKED}`;
    if (String(lists.updateRule) !== LIST_UPDATE_OLD) throw new Error("lists.updateRule isn't what this migration expects: " + lists.updateRule);
    lists.updateRule = LIST_UPDATE_NEW;
    app.save(lists);

    for (const name of ["items", "reservations", "pledges", "questions"]) {
      const c = app.findCollectionByNameOrId(name);
      for (const k of RULES) c[k] = swap(c[k], SWAPS, LIST_OWNER);
      app.save(c);
    }
  },
  (app) => {
    for (const name of ["items", "reservations", "pledges", "questions"]) {
      const c = app.findCollectionByNameOrId(name);
      const back = SWAPS.map(([a, b]) => [b, a]).concat([[LIST_OWNER[1], LIST_OWNER[0]]]);
      for (const k of RULES) c[k] = swap(c[k], back);
      app.save(c);
    }
    const lists = app.findCollectionByNameOrId("lists");
    lists.listRule = String(lists.listRule).replace(LIST_READ[1], LIST_READ[0]);
    lists.viewRule = String(lists.viewRule).replace(LIST_READ[1], LIST_READ[0]);
    lists.createRule = String(lists.createRule).replace(/^\((.*)\) && @request\.body\.co_owner:isset = false.*$/, "$1");
    lists.updateRule = LIST_UPDATE_OLD;
    for (const f of ["co_owner", "co_owner_name", "co_invite"]) lists.fields.removeByName(f);
    app.save(lists);
  },
);
