// Secret Santa helpers shared by the /api/giftlist/exchanges/… routes.
//
// Privacy: exchange_members is superuser-only, and these helpers decide what
// each person may see. Nobody gets the full pairing; you only ever learn who
// *you* are giving to.

const u = require(`${__hooks}/lib/util.js`);

function loadExchange(app, id) {
  try {
    return app.findRecordById("exchanges", id);
  } catch (_) {
    throw new NotFoundError("This gift exchange no longer exists. The organizer may have deleted it.");
  }
}

function membersOf(app, exchangeId) {
  return app.findRecordsByFilter("exchange_members", "exchange = {:x}", "created", 0, 0, { x: exchangeId });
}

function isOrganizer(exchange, auth) {
  return !!auth && exchange.getString("owner") === auth.id;
}

// Throws unless the signed-in user is in the exchange (or organizes it)
function requireAccess(app, exchange, auth) {
  const members = membersOf(app, exchange.id);
  const me = members.find((m) => m.getString("user") === auth.id) || null;
  if (!me && !isOrganizer(exchange, auth)) {
    throw new ForbiddenError("You're not part of this gift exchange. Ask the organizer for the join link.");
  }
  return { members, me };
}

function requireOrganizer(exchange, auth, action) {
  if (!isOrganizer(exchange, auth)) throw new ForbiddenError(`Only the organizer can ${action}.`);
}

function requireOpen(exchange, action) {
  if (exchange.getString("status") === "drawn") {
    throw new BadRequestError(`Names have already been drawn, so you can't ${action} right now. The organizer can redraw names to change who's in.`);
  }
}

function userOf(app, member) {
  const id = member.getString("user");
  if (!id) return null;
  try {
    return app.findRecordById("users", id);
  } catch (_) {
    return null;
  }
}

function memberName(app, member) {
  const user = userOf(app, member);
  if (user) return u.displayName(user);
  return member.getString("name") || member.getString("email").split("@")[0] || "Someone";
}

function exclusionsOf(member) {
  // JSON fields come back as raw bytes; getString gives the JSON text
  try {
    const arr = JSON.parse(member.getString("exclusions") || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch (_) {
    return [];
  }
}

// { title, link } for a member's chosen wish list, if it still exists
function listInfo(app, member) {
  const id = member.getString("list");
  if (!id) return null;
  try {
    const list = app.findRecordById("lists", id);
    return { id: list.id, title: list.getString("title"), link: `${u.appUrl(app)}/s/${list.getString("share_token")}`, token: list.getString("share_token") };
  } catch (_) {
    return null;
  }
}

function ownListOrThrow(app, listId, auth) {
  if (!listId) return "";
  let list;
  try {
    list = app.findRecordById("lists", listId);
  } catch (_) {
    throw new BadRequestError("That wish list no longer exists. Pick another one.");
  }
  if (list.getString("owner") !== auth.id) throw new ForbiddenError("You can only share your own wish lists.");
  return list.id;
}

function exchangeJson(app, exchange, auth) {
  const organizer = (() => {
    try {
      return app.findRecordById("users", exchange.getString("owner"));
    } catch (_) {
      return null;
    }
  })();
  const out = {
    id: exchange.id,
    name: exchange.getString("name"),
    event_date: exchange.getString("event_date"),
    budget: exchange.getFloat("budget"),
    currency: exchange.getString("currency"),
    message: exchange.getString("message"),
    status: exchange.getString("status") || "open",
    drawn_at: exchange.getString("drawn_at"),
    revealed: exchange.getBool("revealed"),
    organizer: organizer ? u.displayName(organizer) : "",
    isOrganizer: isOrganizer(exchange, auth),
  };
  if (out.isOrganizer) out.joinLink = `${u.appUrl(app)}/x/${exchange.getString("join_token")}`;
  return out;
}

// Full view of one exchange for the signed-in user
function detail(app, exchange, auth) {
  const { members, me } = requireAccess(app, exchange, auth);
  const organizer = isOrganizer(exchange, auth);
  const drawn = exchange.getString("status") === "drawn";

  const view = {
    exchange: exchangeJson(app, exchange, auth),
    members: members.map((m) => {
      const joined = !!m.getString("user");
      const row = {
        id: m.id,
        name: memberName(app, m),
        joined,
        you: !!me && m.id === me.id,
        organizer: m.getString("user") === exchange.getString("owner"),
        hasList: !!listInfo(app, m),
      };
      if (organizer) {
        row.exclusions = exclusionsOf(m);
        if (!joined) row.email = m.getString("email");
      }
      return row;
    }),
    me: null,
    match: null,
  };

  if (me) {
    const list = listInfo(app, me);
    view.me = { id: me.id, list: list ? list.id : "", listTitle: list ? list.title : "" };
    const rid = me.getString("recipient");
    if (drawn && rid) {
      const r = members.find((m) => m.id === rid);
      if (r) {
        const rl = listInfo(app, r);
        view.match = { name: memberName(app, r), list: rl ? { title: rl.title, token: rl.token } : null };
      }
    }
    // once the organizer reveals, everyone sees who had them
    if (drawn && exchange.getBool("revealed")) {
      const santa = members.find((m) => m.getString("recipient") === me.id);
      if (santa) view.santa = { name: memberName(app, santa) };
    }
  }
  return view;
}

// For messages: you, the person you're buying for, and your (anonymous) Santa
function santaPair(app, exchangeId, auth) {
  const ex = loadExchange(app, exchangeId);
  const { members, me } = requireAccess(app, ex, auth);
  if (!me) throw new ForbiddenError("Only people in this exchange can send messages.");
  if (ex.getString("status") !== "drawn") throw new BadRequestError("Messages open up once names are drawn.");
  const recipient = members.find((m) => m.id === me.getString("recipient")) || null;
  const santa = members.find((m) => m.getString("recipient") === me.id) || null;
  return { ex, me, recipient, santa };
}

// Messages between two members, from `a`'s point of view
function thread(app, exchangeId, a, b) {
  if (!a || !b) return [];
  return app
    .findRecordsByFilter("exchange_messages", "exchange = {:x} && ((from = {:a} && to = {:b}) || (from = {:b} && to = {:a}))", "created", 200, 0, {
      x: exchangeId,
      a: a.id,
      b: b.id,
    })
    .map((m) => ({ id: m.id, mine: m.getString("from") === a.id, text: m.getString("text"), created: m.getString("created") }));
}

module.exports = {
  santaPair,
  thread,
  loadExchange,
  membersOf,
  isOrganizer,
  requireAccess,
  requireOrganizer,
  requireOpen,
  memberName,
  exclusionsOf,
  listInfo,
  ownListOrThrow,
  exchangeJson,
  detail,
};
