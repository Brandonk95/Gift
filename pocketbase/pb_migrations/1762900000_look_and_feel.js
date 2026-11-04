/// <reference path="../pb_data/types.d.ts" />

// Look and feel for lists:
//  - theme: a patterned banner (snow, confetti, …) and cover: your own banner photo
//  - friend_view: the layout friends see first (they can still switch)
//  - private: an ideas board only the owner sees. Share links don't open it, so
//    every rule that lets a share token in also checks `private = false`.
const THEMES = ["snow", "confetti", "baby", "hearts", "garden", "stars"];
const VIEWS = ["grid", "compact", "list", "board"];
const TOKEN = /([\w.]*)share_token = @request\.headers\.x_share_token(?! && [\w.]*private = false)/g;
const UNTOKEN = /([\w.]*)share_token = @request\.headers\.x_share_token && [\w.]*private = false/g;
const COLLECTIONS = ["lists", "items", "reservations", "pledges", "questions"];
const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"];

migrate((app) => {
  const lists = app.findCollectionByNameOrId("lists");
  lists.fields.add(new SelectField({ name: "theme", values: THEMES, maxSelect: 1 }));
  lists.fields.add(
    new FileField({
      name: "cover",
      maxSelect: 1,
      maxSize: 5 * 1024 * 1024,
      mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"],
      thumbs: ["1200x400", "600x200"],
    })
  );
  lists.fields.add(new SelectField({ name: "friend_view", values: VIEWS, maxSelect: 1 }));
  lists.fields.add(new BoolField({ name: "private" }));
  app.save(lists);

  for (const name of COLLECTIONS) {
    const c = app.findCollectionByNameOrId(name);
    for (const k of RULES) {
      if (c[k] == null) continue;
      c[k] = String(c[k]).replace(TOKEN, "$1share_token = @request.headers.x_share_token && $1private = false");
    }
    app.save(c);
  }
}, (app) => {
  for (const name of COLLECTIONS) {
    const c = app.findCollectionByNameOrId(name);
    for (const k of RULES) {
      if (c[k] == null) continue;
      c[k] = String(c[k]).replace(UNTOKEN, "$1share_token = @request.headers.x_share_token");
    }
    app.save(c);
  }
  const lists = app.findCollectionByNameOrId("lists");
  for (const f of ["theme", "cover", "friend_view", "private"]) lists.fields.removeByName(f);
  app.save(lists);
});
