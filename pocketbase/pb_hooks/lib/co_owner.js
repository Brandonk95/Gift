// Helpers for co_owner.pb.js

function byInvite(app, token) {
  token = String(token || "");
  let list = null;
  if (token.length >= 20) {
    try {
      list = app.findFirstRecordByFilter("lists", "co_invite = {:t}", { t: token });
    } catch (_) {}
  }
  if (!list) throw new NotFoundError("This invite link doesn't work anymore. Ask whoever sent it for a new one.");
  return list;
}

module.exports = { byInvite };
