/// <reference path="../pb_data/types.d.ts" />

// Keep users.email_hash (for Gravatar pictures) in step with the email, however the
// account was made or its email changed (sign-up, guest code, email change, admin).
onRecordCreate((e) => {
  e.record.set("email_hash", $security.sha256(String(e.record.email()).trim().toLowerCase()));
  e.next();
}, "users");

onRecordUpdate((e) => {
  const hash = $security.sha256(String(e.record.email()).trim().toLowerCase());
  if (e.record.getString("email_hash") !== hash) e.record.set("email_hash", hash);
  e.next();
}, "users");
