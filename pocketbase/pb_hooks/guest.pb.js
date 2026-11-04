/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Reserve without an account. The share page asks for a name and email, calls this
// route, then PocketBase's own request-otp / auth-with-otp to sign in with a 6-digit
// emailed code. Existing accounts are left untouched (they simply get a code), and
// the answer is the same either way, so the route can't be used to check who has an
// account.
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/giftlist/guest", (e) => {
  const u = require(`${__hooks}/lib/util.js`);
  if (!u.smtpEnabled(e.app)) throw new BadRequestError("Email isn't set up on this site, so sign-in codes can't be sent. Create an account with a password instead.");
  const body = e.requestInfo().body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new BadRequestError("Enter a valid email address so we can send you a code.");
  if (!name) throw new BadRequestError("Enter your name, so you know which gifts are yours.");

  let existing = null;
  try {
    existing = e.app.findAuthRecordByEmail("users", email);
  } catch (_) {}
  if (!existing) {
    const user = new Record(e.app.findCollectionByNameOrId("users"));
    user.setEmail(email);
    user.set("name", name);
    user.set("guest", true);
    user.setPassword($security.randomString(40));
    e.app.save(user);
  }
  return e.json(200, { ok: true });
});

// Guests (signed in by email code) turn their account into a normal one by choosing
// a password. They never knew the random one, so no current password is asked for.
routerAdd(
  "POST",
  "/api/giftlist/account/password",
  (e) => {
    const user = e.app.findRecordById("users", e.auth.id);
    if (!user.getBool("guest")) throw new BadRequestError("Your account already has a password. Change it with your current password instead.");
    const body = e.requestInfo().body || {};
    const password = String(body.password || "");
    if (password.length < 8) throw new BadRequestError("Use at least 8 characters for your password.");
    if (password.length > 71) throw new BadRequestError("That password is too long. Use 71 characters or fewer.");
    if (password !== String(body.passwordConfirm || "")) throw new BadRequestError("The passwords don't match. Retype them so they're exactly the same.");
    user.setPassword(password);
    user.set("guest", false);
    e.app.save(user);
    // the password change signs out old sessions, so hand back a fresh one
    return $apis.recordAuthResponse(e, user, "password");
  },
  $apis.requireAuth("users")
);
