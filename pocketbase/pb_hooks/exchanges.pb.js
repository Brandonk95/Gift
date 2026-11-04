/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Secret Santa / gift exchanges. The organizer creates an exchange through the
// normal collection API; everything about members goes through these routes
// (see lib/exchanges.js for the privacy rules).
// ---------------------------------------------------------------------------

// New exchanges start open, and the organizer is automatically in it
onRecordCreateRequest((e) => {
  e.record.set("status", "open");
  e.next();
}, "exchanges");

onRecordAfterCreateSuccess((e) => {
  const members = e.app.findCollectionByNameOrId("exchange_members");
  const me = new Record(members);
  me.set("exchange", e.record.id);
  me.set("user", e.record.getString("owner"));
  e.app.save(me);
  e.next();
}, "exchanges");

// Your exchanges, newest first, with your match's name once names are drawn
routerAdd(
  "GET",
  "/api/giftlist/exchanges",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const mine = e.app.findRecordsByFilter("exchange_members", "user = {:u}", "-created", 200, 0, { u: e.auth.id });
    const ids = mine.map((m) => m.getString("exchange"));
    const owned = e.app.findRecordsByFilter("exchanges", "owner = {:u}", "-created", 200, 0, { u: e.auth.id });
    for (const ex of owned) if (ids.indexOf(ex.id) < 0) ids.push(ex.id);

    const out = [];
    for (const id of ids) {
      let ex;
      try {
        ex = e.app.findRecordById("exchanges", id);
      } catch (_) {
        continue;
      }
      const members = x.membersOf(e.app, ex.id);
      const me = members.find((m) => m.getString("user") === e.auth.id);
      const match = me && ex.getString("status") === "drawn" ? members.find((m) => m.id === me.getString("recipient")) : null;
      out.push({
        ...x.exchangeJson(e.app, ex, e.auth, e),
        joined: members.filter((m) => m.getString("user")).length,
        invited: members.filter((m) => !m.getString("user")).length,
        matchName: match ? x.memberName(e.app, match) : "",
        created: ex.getString("created"),
      });
    }
    out.sort((a, b) => (b.created > a.created ? 1 : -1));
    return e.json(200, out);
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/giftlist/exchanges/{id}",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    return e.json(200, x.detail(e.app, ex, e.auth, e));
  },
  $apis.requireAuth()
);

// Email invitations with the join link (organizer)
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/invite",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    x.requireOrganizer(ex, e.auth, "send invitations");
    x.requireOpen(ex, "invite more people");
    if (!u.smtpEnabled(e.app)) {
      throw new BadRequestError("Email isn't set up on this server yet, so invitations can't be sent. Copy the join link and send it yourself instead.");
    }

    const emails = u.parseEmails((e.requestInfo().body || {}).emails, 50);
    const members = x.membersOf(e.app, ex.id);
    if (members.length + emails.length > 100) throw new BadRequestError("A gift exchange can have up to 100 people.");

    const memberEmails = members.map((m) => {
      if (m.getString("email")) return m.getString("email").toLowerCase();
      try {
        return e.app.findRecordById("users", m.getString("user")).email().toLowerCase();
      } catch (_) {
        return "";
      }
    });

    const mail = require(`${__hooks}/lib/mails.js`).exchangeInviteEmail({
      appName: e.app.settings().meta.appName,
      appUrl: u.appUrl(e.app, e),
      currency: ($os.getenv("APP_CURRENCY") || "USD").trim(),
      exchange: ex,
      from: u.displayName(e.auth),
      link: `${u.appUrl(e.app, e)}/x/${ex.getString("join_token")}`,
    });

    const col = e.app.findCollectionByNameOrId("exchange_members");
    const result = { sent: 0, failed: [], alreadyIn: [] };
    for (const addr of emails) {
      const existing = memberEmails.indexOf(addr);
      // re-send to people who were invited but haven't joined; skip people already in
      if (existing >= 0 && members[existing].getString("user")) {
        result.alreadyIn.push(addr);
        continue;
      }
      if (existing < 0) {
        const m = new Record(col);
        m.set("exchange", ex.id);
        m.set("email", addr);
        m.set("name", addr.split("@")[0]);
        e.app.save(m);
      }
      try {
        u.sendMail(e.app, [addr], mail.subject, mail.html, mail.text);
        result.sent++;
      } catch (err) {
        console.log("[giftlist] exchange invite failed for", addr, err);
        result.failed.push(addr);
      }
    }
    if (result.sent === 0 && result.failed.length) {
      throw new BadRequestError("The mail server refused to send the invitations. They're on the guest list, but nobody was emailed. Copy the join link and send it yourself, and ask the site admin to check the SMTP settings.");
    }
    return e.json(200, result);
  },
  $apis.requireAuth()
);

// Join page preview (anyone signed in with the link)
routerAdd(
  "GET",
  "/api/giftlist/join/{token}",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    let ex;
    try {
      ex = e.app.findFirstRecordByFilter("exchanges", "join_token = {:t}", { t: e.request.pathValue("token") });
    } catch (_) {
      throw new NotFoundError("This join link doesn't work. It may have been mistyped, or the exchange was deleted. Ask the organizer for a new link.");
    }
    const members = x.membersOf(e.app, ex.id);
    const me = members.find((m) => m.getString("user") === e.auth.id);
    return e.json(200, {
      ...x.exchangeJson(e.app, ex, e.auth, e),
      joined: members.filter((m) => m.getString("user")).length,
      alreadyIn: !!me,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/giftlist/join/{token}",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    let ex;
    try {
      ex = e.app.findFirstRecordByFilter("exchanges", "join_token = {:t}", { t: e.request.pathValue("token") });
    } catch (_) {
      throw new NotFoundError("This join link doesn't work. It may have been mistyped, or the exchange was deleted. Ask the organizer for a new link.");
    }
    const listId = x.ownListOrThrow(e.app, String((e.requestInfo().body || {}).list || ""), e.auth);
    const members = x.membersOf(e.app, ex.id);
    let me = members.find((m) => m.getString("user") === e.auth.id);
    if (!me) {
      x.requireOpen(ex, "join");
      if (members.length >= 100) throw new BadRequestError("This gift exchange is full (100 people).");
      // claim an emailed invitation if there is one
      const email = e.auth.email().toLowerCase();
      me = members.find((m) => !m.getString("user") && m.getString("email").toLowerCase() === email);
      if (!me) {
        me = new Record(e.app.findCollectionByNameOrId("exchange_members"));
        me.set("exchange", ex.id);
      }
      me.set("user", e.auth.id);
    }
    if (listId) me.set("list", listId);
    e.app.save(me);
    return e.json(200, { id: ex.id });
  },
  $apis.requireAuth()
);

// Pick (or change) the wish list your Secret Santa sees
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/my-list",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    const { members, me } = x.requireAccess(e.app, ex, e.auth);
    if (!me) throw new ForbiddenError("Join the exchange first.");
    const hadList = !!x.listInfo(e.app, me, e);
    me.set("list", x.ownListOrThrow(e.app, String((e.requestInfo().body || {}).list || ""), e.auth));
    e.app.save(me);

    // tell your Secret Santa the first time a list shows up after the draw
    const list = x.listInfo(e.app, me, e);
    if (!hadList && list && ex.getString("status") === "drawn" && u.smtpEnabled(e.app)) {
      const santa = members.find((m) => m.getString("recipient") === me.id);
      if (santa) {
        try {
          const santaUser = e.app.findRecordById("users", santa.getString("user"));
          const mail = require(`${__hooks}/lib/mails.js`).exchangeListReadyEmail({
            appName: e.app.settings().meta.appName,
            appUrl: u.appUrl(e.app, e),
            exchange: ex,
            recipient: x.memberName(e.app, me),
            listLink: list.link,
          });
          u.sendUserMail(e.app, santaUser, "santa", mail, u.appUrl(e.app, e));
        } catch (err) {
          console.log("[giftlist] list-ready email failed:", err);
        }
      }
    }
    return e.json(200, x.detail(e.app, ex, e.auth, e));
  },
  $apis.requireAuth()
);

// Who a member must not draw (organizer); applied both ways at draw time
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/members/{mid}/exclusions",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    x.requireOrganizer(ex, e.auth, "set who can't draw whom");
    const members = x.membersOf(e.app, ex.id);
    const target = members.find((m) => m.id === e.request.pathValue("mid"));
    if (!target) throw new NotFoundError("That person isn't in this exchange anymore. Refresh the page.");
    const ids = members.map((m) => m.id);
    const raw = (e.requestInfo().body || {}).exclude;
    const exclude = (Array.isArray(raw) ? raw : []).map(String).filter((id, i, a) => id !== target.id && ids.indexOf(id) >= 0 && a.indexOf(id) === i);
    target.set("exclusions", exclude);
    e.app.save(target);
    // keep it symmetric so both people show the rule
    for (const m of members) {
      if (m.id === target.id) continue;
      const theirs = x.exclusionsOf(m);
      const has = theirs.indexOf(target.id) >= 0;
      const want = exclude.indexOf(m.id) >= 0;
      if (has !== want) {
        m.set("exclusions", want ? theirs.concat([target.id]) : theirs.filter((id) => id !== target.id));
        e.app.save(m);
      }
    }
    return e.json(200, x.detail(e.app, ex, e.auth, e));
  },
  $apis.requireAuth()
);

// Remove someone (organizer) or leave (yourself), before names are drawn
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/members/{mid}/remove",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    const { members, me } = x.requireAccess(e.app, ex, e.auth);
    const target = members.find((m) => m.id === e.request.pathValue("mid"));
    if (!target) throw new NotFoundError("That person isn't in this exchange anymore. Refresh the page.");
    const self = !!me && me.id === target.id;
    if (!self && !x.isOrganizer(ex, e.auth)) throw new ForbiddenError("Only the organizer can remove people.");
    if (target.getString("user") === ex.getString("owner")) {
      throw new BadRequestError("The organizer can't leave their own exchange. Delete the exchange instead if it's no longer happening.");
    }
    x.requireOpen(ex, self ? "leave" : "remove people");
    e.app.delete(target);
    for (const m of members) {
      const theirs = x.exclusionsOf(m);
      if (m.id !== target.id && theirs.indexOf(target.id) >= 0) {
        m.set("exclusions", theirs.filter((id) => id !== target.id));
        e.app.save(m);
      }
    }
    return e.json(200, self ? { left: true } : x.detail(e.app, ex, e.auth, e));
  },
  $apis.requireAuth()
);

// Draw (or redraw) names and email everyone their match (organizer)
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/draw",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const x = require(`${__hooks}/lib/exchanges.js`);
    const santa = require(`${__hooks}/lib/santa.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    x.requireOrganizer(ex, e.auth, "draw names");
    const redraw = ex.getString("status") === "drawn";

    const all = x.membersOf(e.app, ex.id);
    const joined = all.filter((m) => m.getString("user"));
    const pending = all.length - joined.length;
    if (joined.length < 3) {
      throw new BadRequestError(
        `You need at least 3 people who've joined to draw names. ${joined.length === 1 ? "Only you have" : `${joined.length} people have`} joined so far` +
          (pending ? `, and ${pending} invited ${pending === 1 ? "person hasn't" : "people haven't"} joined yet.` : ". Share the join link to get more people in.")
      );
    }

    const exclusions = {};
    for (const m of joined) exclusions[m.id] = x.exclusionsOf(m);
    const result = santa.draw(joined.map((m) => m.id), exclusions);
    if (result.error) {
      const names = (ids) => ids.map((id) => x.memberName(e.app, joined.find((m) => m.id === id))).join(", ");
      throw new BadRequestError(
        result.error === "no_options"
          ? `${names(result.ids)} can't draw anyone with the current rules. Remove some of the “can't draw” rules and try again.`
          : "There's no way to draw names with the current “can't draw” rules. Remove a rule or two (or add more people) and try again."
      );
    }

    e.app.runInTransaction((txApp) => {
      for (const m of all) {
        const fresh = txApp.findRecordById("exchange_members", m.id);
        fresh.set("recipient", result.pairs[m.id] || "");
        txApp.save(fresh);
      }
      const fx = txApp.findRecordById("exchanges", ex.id);
      fx.set("status", "drawn");
      fx.set("revealed", false);
      fx.set("drawn_at", new Date().toISOString().replace("T", " "));
      txApp.save(fx);
    });

    const out = { drawn: joined.length, left_out: pending, emailed: 0, failed: 0, redraw };
    if (u.smtpEnabled(e.app)) {
      const mails = require(`${__hooks}/lib/mails.js`);
      const fresh = x.loadExchange(e.app, ex.id);
      for (const m of joined) {
        const r = joined.find((j) => j.id === result.pairs[m.id]);
        const rl = x.listInfo(e.app, r, e);
        try {
          const to = e.app.findRecordById("users", m.getString("user")).email();
          const mail = mails.exchangeMatchEmail({
            appName: e.app.settings().meta.appName,
            appUrl: u.appUrl(e.app, e),
            currency: ($os.getenv("APP_CURRENCY") || "USD").trim(),
            exchange: fresh,
            giver: x.memberName(e.app, m),
            recipient: x.memberName(e.app, r),
            listLink: rl ? rl.link : "",
            exchangeLink: `${u.appUrl(e.app, e)}/exchanges/${ex.id}`,
            redraw,
          });
          u.sendMail(e.app, [to], mail.subject, mail.html, mail.text);
          out.emailed++;
        } catch (err) {
          console.log("[giftlist] match email failed:", err);
          out.failed++;
        }
      }
    }
    return e.json(200, out);
  },
  $apis.requireAuth()
);

// Reveal who everyone's Secret Santa was (organizer, after the draw)
routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/reveal",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const ex = x.loadExchange(e.app, e.request.pathValue("id"));
    x.requireOrganizer(ex, e.auth, "reveal the Secret Santas");
    if (ex.getString("status") !== "drawn") throw new BadRequestError("Draw names first. There's nothing to reveal yet.");
    ex.set("revealed", !(e.requestInfo().body || {}).hide);
    e.app.save(ex);
    return e.json(200, x.detail(e.app, ex, e.auth, e));
  },
  $apis.requireAuth()
);

// Anonymous messages: each person has one thread with their Santa (who stays
// anonymous) and one with the person they're buying for. See lib/exchanges.js.
routerAdd(
  "GET",
  "/api/giftlist/exchanges/{id}/messages",
  (e) => {
    const x = require(`${__hooks}/lib/exchanges.js`);
    const { ex, me, recipient, santa } = x.santaPair(e.app, e.request.pathValue("id"), e.auth);
    const threadBetween = (a, b) => x.thread(e.app, ex.id, a, b);
    return e.json(200, {
      recipient: recipient ? { name: x.memberName(e.app, recipient), messages: threadBetween(me, recipient) } : null,
      santa: santa ? { name: ex.getBool("revealed") ? x.memberName(e.app, santa) : "", messages: threadBetween(me, santa) } : null,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/giftlist/exchanges/{id}/messages",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const x = require(`${__hooks}/lib/exchanges.js`);
    const { ex, me, recipient, santa } = x.santaPair(e.app, e.request.pathValue("id"), e.auth);
    const body = e.requestInfo().body || {};
    const text = String(body.text || "").trim().slice(0, 1000);
    if (!text) throw new BadRequestError("Write a message first.");
    const toSanta = body.to === "santa";
    const other = toSanta ? santa : recipient;
    if (!other) throw new BadRequestError("There's nobody on the other end of this conversation. Ask the organizer to draw names again.");

    const msg = new Record(e.app.findCollectionByNameOrId("exchange_messages"));
    msg.set("exchange", ex.id);
    msg.set("from", me.id);
    msg.set("to", other.id);
    msg.set("text", text);
    e.app.save(msg);

    if (u.smtpEnabled(e.app) && other.getString("user")) {
      try {
        const otherUser = e.app.findRecordById("users", other.getString("user"));
        const mail = require(`${__hooks}/lib/mails.js`).santaMessageEmail({
          appName: e.app.settings().meta.appName,
          appUrl: u.appUrl(e.app, e),
          exchange: ex,
          // the recipient never learns their Santa's name from a message
          from: toSanta ? x.memberName(e.app, me) : "Your Secret Santa",
          toSanta,
          text,
          link: `${u.appUrl(e.app, e)}/exchanges/${ex.id}#messages`,
        });
        u.sendUserMail(e.app, otherUser, "santa", mail, u.appUrl(e.app, e));
      } catch (err) {
        console.log("[giftlist] santa message email failed:", err);
      }
    }
    return e.json(200, {
      recipient: recipient ? { messages: x.thread(e.app, ex.id, me, recipient) } : null,
      santa: santa ? { messages: x.thread(e.app, ex.id, me, santa) } : null,
    });
  },
  $apis.requireAuth()
);
