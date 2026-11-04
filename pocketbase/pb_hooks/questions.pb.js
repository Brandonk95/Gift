/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Anonymous questions: a friend asks the list owner something ("what size?")
// without saying which gift they're getting. Answers show on the list for every
// friend. Who asked is stored (hidden) only so we can email them the answer.
// ---------------------------------------------------------------------------

onRecordCreateRequest((e) => {
  e.record.set("asker", e.auth ? e.auth.id : "");
  e.record.set("question", e.record.getString("question").trim());
  const item = e.record.getString("item");
  if (item) {
    try {
      if (e.app.findRecordById("items", item).getString("list") !== e.record.getString("list")) throw new Error();
    } catch (_) {
      throw new BadRequestError("That gift isn't on this list anymore. Refresh the page and try again.");
    }
  }
  e.next();

  // tell the list owner (sent here rather than after save so links use the
  // address the person asking is on)
  const u = require(`${__hooks}/lib/util.js`);
  if (!u.smtpEnabled(e.app)) return;
  try {
    const list = e.app.findRecordById("lists", e.record.getString("list"));
    const owner = e.app.findRecordById("users", list.getString("owner"));
    const item = e.record.getString("item") ? e.app.findRecordById("items", e.record.getString("item")) : null;
    const mail = require(`${__hooks}/lib/mails.js`).questionAskedEmail({
      appName: e.app.settings().meta.appName,
      appUrl: u.appUrl(e.app, e),
      list,
      item,
      question: e.record.getString("question"),
    });
    u.sendUserMail(e.app, owner, "questions", mail, u.appUrl(e.app, e));
  } catch (err) {
    console.log("[giftlist] question email failed:", err);
  }
}, "questions");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/lib/util.js`);
  const answer = e.record.getString("answer").trim();
  const wasAnswered = !!e.record.original().getString("answer").trim();
  e.record.set("answer", answer);
  e.record.set("answered_at", answer ? e.record.original().getString("answered_at") || u.pbDate(Date.now()) : "");
  e.next();

  // tell whoever asked, the first time it's answered
  if (!answer || wasAnswered || !u.smtpEnabled(e.app)) return;
  try {
    const askerId = e.record.getString("asker");
    if (!askerId) return;
    const asker = e.app.findRecordById("users", askerId);
    const list = e.app.findRecordById("lists", e.record.getString("list"));
    const item = e.record.getString("item") ? e.app.findRecordById("items", e.record.getString("item")) : null;
    const mail = require(`${__hooks}/lib/mails.js`).questionAnsweredEmail({
      appName: e.app.settings().meta.appName,
      appUrl: u.appUrl(e.app, e),
      list,
      item,
      question: e.record.getString("question"),
      answer,
    });
    u.sendUserMail(e.app, asker, "questions", mail, u.appUrl(e.app, e));
  } catch (err) {
    console.log("[giftlist] answer email failed:", err);
  }
}, "questions");
