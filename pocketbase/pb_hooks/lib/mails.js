// Builds the app's emails. See email.js for the shared layout.
const m = require(`${__hooks}/lib/email.js`);
const { RESERVATION_DAYS } = require(`${__hooks}/lib/util.js`);
const HOLD = RESERVATION_DAYS === 7 ? "week" : `${RESERVATION_DAYS} days`;

const OCCASIONS = {
  christmas: ["Christmas", "🎄"],
  birthday: ["Birthday", "🎂"],
  wedding: ["Wedding", "💍"],
  baby: ["Baby shower", "🍼"],
  graduation: ["Graduation", "🎓"],
  anniversary: ["Anniversary", "💞"],
  other: ["Gift list", "🎁"],
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SYMBOLS = { USD: "$", CAD: "CA$", AUD: "A$", NZD: "NZ$", MXN: "MX$", EUR: "€", GBP: "£", JPY: "¥", INR: "₹", BRL: "R$" };

function occasionOf(list) {
  return OCCASIONS[list.getString("occasion")] || OCCASIONS.other;
}

function listEmoji(list) {
  return list.getString("emoji") || occasionOf(list)[1];
}

function formatDate(pbDate) {
  const d = String(pbDate || "").slice(0, 10);
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!p) return "";
  return `${MONTHS[+p[2] - 1]} ${+p[3]}, ${p[1]}`;
}

function daysUntil(pbDate) {
  const d = String(pbDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const target = Date.parse(d + "T00:00:00Z");
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86400000);
}

function formatPrice(n, currency) {
  const v = Number(n) || 0;
  if (!v) return "";
  const cur = (currency || "USD").toUpperCase();
  const fixed = cur === "JPY" ? Math.round(v).toString() : v.toFixed(2);
  const withCommas = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return SYMBOLS[cur] ? `${SYMBOLS[cur]}${withCommas}` : `${withCommas} ${cur}`;
}

function itemImage(appUrl, item) {
  const file = item.getString("image");
  if (file) return `${appUrl}/api/files/items/${item.id}/${encodeURIComponent(file)}?thumb=100x100f`;
  const url = item.getString("image_url");
  return /^https:\/\//i.test(url) ? url : "";
}

function itemDetail(item) {
  return [item.getString("size") && `Size ${item.getString("size")}`, item.getString("color"), item.getInt("quantity") > 1 && `× ${item.getInt("quantity")}`]
    .filter(Boolean)
    .join(" · ");
}

function listSummary(list, giftCount) {
  const [label] = occasionOf(list);
  const date = formatDate(list.getString("event_date"));
  return [label, date, giftCount !== undefined && `${giftCount} gift${giftCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------- invitation
function shareEmail({ appName, appUrl, currency, from, list, items, note, link }) {
  const wanted = items.filter((i) => !i.getBool("received"));
  const rank = { high: 0, medium: 1, low: 2 };
  wanted.sort((a, b) => (rank[a.getString("priority")] ?? 1) - (rank[b.getString("priority")] ?? 1) || a.getInt("sort") - b.getInt("sort"));
  const preview = wanted.slice(0, 3);
  const hidePrices = list.getBool("hide_prices");
  const title = list.getString("title");

  let card = m.row({ emoji: listEmoji(list), title, detail: listSummary(list, wanted.length) });
  if (preview.length) {
    card += `<div style="height:1px;background:#e4e4e7;margin:10px 0 6px"></div>`;
    for (const it of preview) {
      card += m.row({
        image: itemImage(appUrl, it),
        emoji: "🎁",
        title: it.getString("name") + (it.getString("priority") === "high" ? " ★" : ""),
        detail: itemDetail(it),
        value: hidePrices ? "" : formatPrice(it.getFloat("price"), currency),
      });
    }
    if (wanted.length > preview.length) {
      card += `<div style="padding-top:6px;font-family:${m.FONT};font-size:13px;color:#71717a">+ ${wanted.length - preview.length} more on the list</div>`;
    }
  }

  const quote = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
<td style="border-left:3px solid ${m.accent()};padding:4px 0 4px 14px;font-family:${m.FONT};font-size:15px;line-height:1.6;color:#3f3f46;font-style:italic;white-space:pre-wrap">${m.esc(note)}</td></tr></table>`
    : "";

  const content =
    m.paragraph(`<strong>${m.esc(from)}</strong> shared their gift list with you on ${m.esc(appName)}.`) +
    quote +
    m.panel(card) +
    m.button(link, `Open ${from}'s list`) +
    m.paragraph(`Found something you'd like to give? Click <strong>“I'll get this”</strong> to reserve it, so nobody else buys the same thing. ${m.esc(from)} can't see what's been reserved, so the surprise stays safe.`) +
    m.fallbackLink(link);

  const html = m.render({
    appName,
    appUrl,
    preheader: `${from} shared “${title}” with you — see what they're wishing for.`,
    heading: `${from} shared a gift list with you`,
    content,
    reason: `You're receiving this because ${from} entered your email address to share a gift list. You won't get further emails unless you sign up.`,
  });
  const text = m.plainText([
    `${from} shared a gift list with you on ${appName}: "${title}" (${listSummary(list, wanted.length)}).`,
    note ? `"${note}"` : null,
    `Open the list: ${link}`,
    `Reserve a gift so nobody else buys the same thing. ${from} can't see what's been reserved.`,
    `Can't find our emails? Check your spam or junk folder and mark us as "Not spam".`,
    `— ${appName}`,
  ]);
  return { subject: `${from} shared a gift list with you: ${title}`, html, text };
}

// ------------------------------------------------------- reservation reminder
function reservationEmail({ appName, appUrl, currency, list, item }) {
  const owner = list.getString("owner_name") || "your friend";
  const title = list.getString("title");
  const listLink = `${appUrl}/s/${list.getString("share_token")}`;
  const shopLink = `${appUrl}/shopping`;
  const buyUrl = item.getString("url");
  const date = formatDate(list.getString("event_date"));
  const days = daysUntil(list.getString("event_date"));
  const when = date ? (days !== null && days >= 0 ? `${date} — ${days === 0 ? "today" : days === 1 ? "tomorrow" : `${days} days from now`}` : date) : "";

  const card = m.row({
    image: itemImage(appUrl, item),
    emoji: "🎁",
    title: item.getString("name"),
    detail: itemDetail(item) || `From ${owner}'s list`,
    value: list.getBool("hide_prices") ? "" : formatPrice(item.getFloat("price") * Math.max(1, item.getInt("quantity")), currency),
  });

  const content =
    m.paragraph(
      `You reserved this gift on <strong>${m.esc(owner)}</strong>'s list “${m.esc(title)}”. Nobody else can reserve it for the next <strong>${RESERVATION_DAYS} days</strong>. Renew it from your shopping list to keep it longer, or mark it as bought and it stays yours.`
    ) +
    m.panel(card) +
    (when ? m.paragraph(`📅 <strong>${m.esc(list.getString("occasion") ? occasionOf(list)[0] : "The occasion")}:</strong> ${m.esc(when)}`) : "") +
    (item.getString("description") ? m.paragraph(`<span style="color:#71717a">Notes from ${m.esc(owner)}:</span> ${m.esc(item.getString("description"))}`) : "") +
    (buyUrl ? m.button(buyUrl, "See where to buy it") : m.button(shopLink, "Open my shopping list")) +
    m.paragraph(
      buyUrl
        ? `It's also on your <a href="${m.esc(shopLink)}" style="color:${m.accent()}">shopping list</a>, where you can tick it off once you've bought it. Changed your mind? Cancel the reservation from <a href="${m.esc(listLink)}" style="color:${m.accent()}">the list</a>.`
        : `Tick it off on your shopping list once you've bought it. Changed your mind? Cancel the reservation from <a href="${m.esc(listLink)}" style="color:${m.accent()}">the list</a>.`
    ) +
    m.note(`🤫 ${m.esc(owner)} can't see who reserved what — the surprise is safe.`);

  const html = m.render({
    appName,
    appUrl,
    preheader: `“${item.getString("name")}” is reserved for you on ${owner}'s list.`,
    heading: "Gift reserved 🎉",
    content,
    reason: `You're receiving this because you reserved a gift on ${appName}.`,
  });
  const text = m.plainText([
    `You reserved "${item.getString("name")}" on ${owner}'s list "${title}".`,
    `It's held for ${RESERVATION_DAYS} days. Renew it from your shopping list to keep it longer, or mark it as bought and it stays yours.`,
    when ? `Occasion: ${when}` : null,
    buyUrl ? `Where to buy: ${buyUrl}` : null,
    `Your shopping list: ${shopLink}`,
    `${owner} can't see who reserved what.`,
    `— ${appName}`,
  ]);
  return { subject: `Reserved: ${item.getString("name")} for ${owner}`, html, text };
}

// A day before a reservation runs out
function reservationReminderEmail({ appName, appUrl, currency, list, item, expires }) {
  const owner = list.getString("owner_name") || "your friend";
  const title = list.getString("title");
  const shopLink = `${appUrl}/shopping`;
  const listLink = `${appUrl}/s/${list.getString("share_token")}`;

  const card = m.row({
    image: itemImage(appUrl, item),
    emoji: "🎁",
    title: item.getString("name"),
    detail: itemDetail(item) || `From ${owner}'s list`,
    value: list.getBool("hide_prices") ? "" : formatPrice(item.getFloat("price") * Math.max(1, item.getInt("quantity")), currency),
  });

  const content =
    m.paragraph(
      `Your reservation on <strong>${m.esc(owner)}</strong>'s list “${m.esc(title)}” ends <strong>${m.esc(formatDate(expires) || "soon")}</strong>. After that, anyone else can reserve this gift.`
    ) +
    m.panel(card) +
    m.button(shopLink, RESERVATION_DAYS === 7 ? "Keep it for another week" : `Keep it for another ${HOLD}`) +
    m.paragraph(
      `Already bought it? Tick it off on your shopping list and it stays yours. Don't need it anymore? Do nothing, or cancel it from <a href="${m.esc(listLink)}" style="color:${m.accent()}">the list</a>.`
    ) +
    m.note(`🤫 ${m.esc(owner)} can't see who reserved what.`);

  const html = m.render({
    appName,
    appUrl,
    preheader: `Renew “${item.getString("name")}” or it'll be released for someone else.`,
    heading: "Your reservation ends soon",
    content,
    reason: `You're receiving this because you reserved a gift on ${appName}.`,
  });
  const text = m.plainText([
    `Your reservation for "${item.getString("name")}" on ${owner}'s list "${title}" ends ${formatDate(expires) || "soon"}.`,
    `Keep it for another ${HOLD}: ${shopLink}`,
    `Already bought it? Tick it off on your shopping list and it stays yours.`,
    `— ${appName}`,
  ]);
  return {
    subject: `Renew your reservation: ${item.getString("name")}`,
    html,
    text,
    push: { title: "Your reservation ends soon", body: `“${item.getString("name")}” on ${owner}'s list is released ${formatDate(expires) || "soon"}. Tap to keep it.`, url: shopLink },
  };
}

// After a reservation ran out without being renewed
function reservationReleasedEmail({ appName, appUrl, list, item }) {
  const owner = list.getString("owner_name") || "your friend";
  const listLink = `${appUrl}/s/${list.getString("share_token")}`;
  const content =
    m.paragraph(
      `Your reservation for <strong>${m.esc(item.getString("name"))}</strong> on ${m.esc(owner)}'s list “${m.esc(list.getString("title"))}” ran out, so anyone can reserve it now.`
    ) +
    m.panel(m.row({ image: itemImage(appUrl, item), emoji: "🎁", title: item.getString("name"), detail: itemDetail(item) || `From ${owner}'s list` })) +
    m.button(listLink, "Reserve it again") +
    m.note(`Still planning to get it? Reserve it again before someone else does. Bought it already? Reserve it and tick it off as bought so it stays yours.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: `“${item.getString("name")}” is available again on ${owner}'s list.`,
    heading: "Your reservation ended",
    content,
    reason: `You're receiving this because you reserved a gift on ${appName}.`,
  });
  const text = m.plainText([
    `Your reservation for "${item.getString("name")}" on ${owner}'s list "${list.getString("title")}" ran out, so anyone can reserve it now.`,
    `Reserve it again: ${listLink}`,
    `— ${appName}`,
  ]);
  return {
    subject: `Reservation ended: ${item.getString("name")}`,
    html,
    text,
    push: { title: "Your reservation ended", body: `“${item.getString("name")}” on ${owner}'s list is open again. Tap to reserve it again.`, url: listLink },
  };
}

// A week before a followed list's occasion
function occasionReminderEmail({ appName, appUrl, list, days, open, link }) {
  const owner = list.getString("owner_name") || "Your friend";
  const [label] = occasionOf(list);
  const occ = list.getString("occasion");
  const what = occ && occ !== "other" ? `${owner}'s ${label.toLowerCase()}` : `${owner}'s “${list.getString("title")}”`;
  const when = days === 1 ? "tomorrow" : `${days} days from now`;
  const content =
    m.paragraph(
      `<strong>${m.esc(what)}</strong> is on ${m.esc(formatDate(list.getString("event_date")))}, ${when}. ` +
        (open ? `${open} gift${open === 1 ? " is" : "s are"} still up for grabs.` : "Every gift on the list has been claimed, but you can still take a look.")
    ) +
    m.panel(m.row({ emoji: listEmoji(list), title: list.getString("title"), detail: listSummary(list) })) +
    m.button(link, open ? "Pick a gift" : "Open the list") +
    m.note(`You're getting this because you follow ${m.esc(owner)}'s list. To stop, open the list and press <strong>Following</strong>.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: open ? `${open} gift${open === 1 ? "" : "s"} still open on ${owner}'s list.` : `${owner}'s day is coming up.`,
    heading: `${what} is coming up`,
    content,
    reason: `You're receiving this because you follow a gift list on ${appName}.`,
  });
  const text = m.plainText([
    `${what} is on ${formatDate(list.getString("event_date"))}, ${when}.`,
    open ? `${open} gift(s) still open: ${link}` : `Open the list: ${link}`,
    `— ${appName}`,
  ]);
  const subject = `${what} is in ${days} day${days === 1 ? "" : "s"}` + (open ? ` · ${open} gift${open === 1 ? "" : "s"} still open` : "");
  const pushTitle = `${what.charAt(0).toUpperCase()}${what.slice(1)} is ${when}`;
  return { subject, html, text, push: { title: pushTitle, body: open ? `${open} gift${open === 1 ? "" : "s"} still open. Tap to pick one.` : "Tap to see the list.", url: link } };
}

// A friend asked the list owner something (anonymously)
function questionAskedEmail({ appName, appUrl, list, item, question }) {
  const title = list.getString("title");
  const link = `${appUrl}/lists/${list.id}#questions`;
  const about = item ? ` about <strong>${m.esc(item.getString("name"))}</strong>` : "";
  const content =
    m.paragraph(`Someone looking at your list “${m.esc(title)}” has a question${about}:`) +
    quote(question) +
    m.button(link, "Answer it") +
    m.note(`Questions are anonymous, so you won't know who asked (or what they're getting you). Your answer shows on the list for everyone, and we'll email it to them.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: question.slice(0, 120),
    heading: "A friend has a question",
    content,
    reason: `You're receiving this because you own a gift list on ${appName}.`,
  });
  const text = m.plainText([`Someone asked about your list "${title}"${item ? ` (${item.getString("name")})` : ""}:`, `"${question}"`, `Answer it: ${link}`, `— ${appName}`]);
  return { subject: `New question on “${title}”${item ? `: ${item.getString("name")}` : ""}`, html, text };
}

// The list owner answered a question you asked
function questionAnsweredEmail({ appName, appUrl, list, item, question, answer }) {
  const owner = list.getString("owner_name") || "The list owner";
  const link = `${appUrl}/s/${list.getString("share_token")}`;
  const content =
    m.paragraph(`<strong>${m.esc(owner)}</strong> answered your question${item ? ` about <strong>${m.esc(item.getString("name"))}</strong>` : ""}.`) +
    m.paragraph(`<span style="color:#71717a">You asked:</span> ${m.esc(question)}`) +
    quote(answer) +
    m.button(link, `Open ${owner}'s list`) +
    m.note(`🤫 ${m.esc(owner)} still doesn't know who asked.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: answer.slice(0, 120),
    heading: `${owner} answered`,
    content,
    reason: `You're receiving this because you asked a question on ${appName}.`,
  });
  const text = m.plainText([`${owner} answered your question.`, `You asked: ${question}`, `Answer: ${answer}`, `The list: ${link}`, `— ${appName}`]);
  return { subject: `${owner} answered your question${item ? ` about ${item.getString("name")}` : ""}`, html, text };
}

// A gift you reserved (or chipped in on) got cheaper at the store
function priceDropEmail({ appName, appUrl, list, item, listed, now, currency }) {
  const owner = list.getString("owner_name") || "your friend";
  const buyUrl = item.getString("url");
  const saved = formatPrice(listed - now, currency);
  const content =
    m.paragraph(`Good news: <strong>${m.esc(item.getString("name"))}</strong>, which you're getting for ${m.esc(owner)}, is cheaper right now.`) +
    m.panel(
      m.row({
        image: itemImage(appUrl, item),
        emoji: "🎁",
        title: item.getString("name"),
        detail: `Was ${formatPrice(listed, currency)} · save ${saved}`,
        value: formatPrice(now, currency),
      })
    ) +
    m.button(buyUrl, "See the deal") +
    m.note(`Prices change quickly, so check the store before you buy. We check gift links about once a week.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: `Now ${formatPrice(now, currency)} (was ${formatPrice(listed, currency)}).`,
    heading: "Price drop 📉",
    content,
    reason: `You're receiving this because you reserved a gift on ${appName}.`,
  });
  const text = m.plainText([
    `${item.getString("name")} (for ${owner}) is now ${formatPrice(now, currency)}, down from ${formatPrice(listed, currency)}.`,
    `See the deal: ${buyUrl}`,
    `— ${appName}`,
  ]);
  return { subject: `Price drop: ${item.getString("name")} is now ${formatPrice(now, currency)}`, html, text };
}

// Secret Santa message (the Santa's name is never in a message to their recipient)
function santaMessageEmail({ appName, appUrl, exchange, from, toSanta, text, link }) {
  const name = exchange.getString("name");
  const content =
    m.paragraph(
      toSanta
        ? `<strong>${m.esc(from)}</strong>, the person you're buying for in “${m.esc(name)}”, sent you a message. They don't know you're their Santa.`
        : `<strong>Your Secret Santa</strong> in “${m.esc(name)}” sent you a message.`
    ) +
    quote(text) +
    m.button(link, "Reply") +
    m.note(toSanta ? "🤫 Replies stay anonymous, so your secret is safe." : "🤫 They'll stay anonymous until the organizer reveals the Santas.");
  const html = m.render({
    appName,
    appUrl,
    preheader: text.slice(0, 120),
    heading: toSanta ? `${from} sent you a message` : "Your Secret Santa sent you a message",
    content,
    reason: `You're receiving this because you're in a Secret Santa on ${appName}.`,
  });
  const textOut = m.plainText([toSanta ? `${from} (your recipient) wrote:` : "Your Secret Santa wrote:", `"${text}"`, `Reply: ${link}`, `— ${appName}`]);
  return { subject: toSanta ? `🎅 ${from} sent you a message` : "🎅 Your Secret Santa sent you a message", html, text: textOut };
}

// Nightly digest: gifts added to lists the person follows
function followDigestEmail({ appName, appUrl, groups }) {
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const gifts = (n) => `${n} new gift${n === 1 ? "" : "s"}`;
  const ownerOf = (list) => list.getString("owner_name") || "Someone";

  let content = m.paragraph(
    groups.length === 1
      ? `<strong>${m.esc(ownerOf(groups[0].list))}</strong> added ${gifts(total)} to “${m.esc(groups[0].list.getString("title"))}” since we last wrote.`
      : `${gifts(total)} on ${groups.length} lists you follow since we last wrote.`
  );
  const text = [];
  for (const g of groups) {
    const { list, items, link, currency } = g;
    const owner = ownerOf(list);
    const shown = items.slice(0, 8);
    let card = m.row({ emoji: listEmoji(list), title: `${owner}: ${list.getString("title")}`, detail: `${listSummary(list)}${listSummary(list) ? " · " : ""}${gifts(items.length)}` });
    card += `<div style="height:1px;background:#e4e4e7;margin:10px 0 6px"></div>`;
    for (const it of shown) {
      card += m.row({
        image: itemImage(appUrl, it),
        emoji: "🎁",
        title: it.getString("name") + (it.getString("priority") === "high" ? " ★" : ""),
        detail: itemDetail(it),
        value: list.getBool("hide_prices") ? "" : formatPrice(it.getFloat("price"), currency),
      });
    }
    if (items.length > shown.length) {
      card += `<div style="padding-top:6px;font-family:${m.FONT};font-size:13px;color:#71717a">+ ${items.length - shown.length} more</div>`;
    }
    content += m.panel(card) + (groups.length > 1 ? m.button(link, `Open ${owner}'s list`) : "");
    text.push(`${owner}'s list "${list.getString("title")}": ${items.map((i) => i.getString("name")).join(", ")}`, `  ${link}`);
  }
  if (groups.length === 1) content += m.button(groups[0].link, `Open ${ownerOf(groups[0].list)}'s list`);
  content +=
    m.paragraph(`Want one? Click <strong>“I'll get this”</strong> on the list to reserve it before someone else does.`) +
    m.note(`You're getting this because you follow ${groups.length === 1 ? "this list" : "these lists"}. To stop, open the list and press <strong>Following</strong>.`);

  const subject =
    groups.length === 1 ? `${ownerOf(groups[0].list)} added ${gifts(total)} to ${groups[0].list.getString("title")}` : `${gifts(total)} on lists you follow`;
  const html = m.render({
    appName,
    appUrl,
    preheader: groups.map((g) => g.items.map((i) => i.getString("name")).join(", ")).join(" · ").slice(0, 140),
    heading: total === 1 ? "A new gift was added" : "New gifts were added",
    content,
    reason: `You're receiving this because you follow a gift list on ${appName}.`,
  });
  const names = groups.reduce((all, g) => all.concat(g.items.map((i) => i.getString("name"))), []);
  return {
    subject,
    html,
    push: { title: subject, body: names.slice(0, 4).join(", ") + (names.length > 4 ? ` and ${names.length - 4} more` : ""), url: groups.length === 1 ? groups[0].link : appUrl, tag: "digest" },
    text: m.plainText([`${gifts(total)} on lists you follow:`, ...text, `To stop these emails, open the list and press "Following".`, `— ${appName}`]),
  };
}

// ---------------------------------------------------- PocketBase auth emails
// ----- Secret Santa ----------------------------------------------------------

function exchangeFacts(exchange, currency) {
  const date = formatDate(exchange.getString("event_date"));
  const days = daysUntil(exchange.getString("event_date"));
  const budget = formatPrice(exchange.getFloat("budget"), exchange.getString("currency") || currency);
  const when = date ? (days !== null && days >= 0 ? `${date} (${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`})` : date) : "";
  const rows = [];
  if (when) rows.push(["📅", "Exchange day", when]);
  if (budget) rows.push(["💰", "Budget", `about ${budget} per gift`]);
  return { when, budget, rows };
}

function factsTable(rows) {
  if (!rows.length) return "";
  return m.panel(
    rows
      .map(
        ([icon, label, value]) =>
          `<div style="font-family:${m.FONT};font-size:14px;line-height:1.5;color:#3f3f46;padding:3px 0">${icon}&nbsp; <strong style="color:#18181b">${m.esc(label)}:</strong> ${m.esc(value)}</div>`
      )
      .join("")
  );
}

function quote(note) {
  return note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
<td style="border-left:3px solid ${m.accent()};padding:4px 0 4px 14px;font-family:${m.FONT};font-size:15px;line-height:1.6;color:#3f3f46;font-style:italic;white-space:pre-wrap">${m.esc(note)}</td></tr></table>`
    : "";
}

function exchangeInviteEmail({ appName, appUrl, currency, exchange, from, link }) {
  const name = exchange.getString("name");
  const facts = exchangeFacts(exchange, currency);
  const note = exchange.getString("message");
  const content =
    m.paragraph(`<strong>${m.esc(from)}</strong> is organizing a Secret Santa gift exchange, <strong>“${m.esc(name)}”</strong>, and wants you in it. 🎅`) +
    quote(note) +
    factsTable(facts.rows) +
    m.button(link, "Join the exchange") +
    m.paragraph(
      `Once everyone's in, ${m.esc(from)} draws names and you'll get an email telling you who you're buying for, with a link to their wish list. You can share one of your own lists so your Secret Santa knows what you'd like.`
    ) +
    m.fallbackLink(link) +
    m.note("🤫 Nobody sees who drew whom — not even the organizer.");
  const html = m.render({
    appName,
    appUrl,
    preheader: `${from} invited you to the Secret Santa “${name}”.`,
    heading: "You're invited to a Secret Santa 🎁",
    content,
    reason: `You're receiving this because ${from} entered your email address on ${appName}.`,
  });
  const text = m.plainText([
    `${from} invited you to the Secret Santa gift exchange "${name}".`,
    note ? `"${note}"` : null,
    facts.when ? `Exchange day: ${facts.when}` : null,
    facts.budget ? `Budget: about ${facts.budget} per gift` : null,
    `Join here: ${link}`,
    "Nobody sees who drew whom, not even the organizer.",
    `— ${appName}`,
  ]);
  return { subject: `${from} invited you to a Secret Santa: ${name}`, html, text };
}

function exchangeMatchEmail({ appName, appUrl, currency, exchange, giver, recipient, listLink, exchangeLink, redraw }) {
  const name = exchange.getString("name");
  const facts = exchangeFacts(exchange, currency);
  const content =
    (redraw ? m.paragraph(`<strong>Names were drawn again</strong> for “${m.esc(name)}”, so please ignore any earlier match.`) : "") +
    m.paragraph(`Hi ${m.esc(giver)}! The names have been drawn for <strong>“${m.esc(name)}”</strong>, and you're the Secret Santa for…`) +
    `<div style="margin:4px 0 24px;padding:22px 18px;background:#f4f4f5;border-radius:12px;text-align:center;font-family:${m.FONT}">
<div style="font-size:34px;line-height:1">🎅</div>
<div style="margin-top:10px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.3px">${m.esc(recipient)}</div></div>` +
    factsTable(facts.rows) +
    (listLink
      ? m.button(listLink, `See ${recipient}'s wish list`) + m.paragraph(`Reserve something on the list so you don't double up with anyone else shopping for ${m.esc(recipient)}.`)
      : m.button(exchangeLink, "Open the exchange") +
        m.paragraph(`${m.esc(recipient)} hasn't shared a wish list yet. We'll email you when they do, and you can always check the exchange page.`)) +
    m.note(`🤫 Keep it secret! Only you know who you're buying for.`);
  const html = m.render({
    appName,
    appUrl,
    preheader: `You're the Secret Santa for ${recipient}. Shh!`,
    heading: "You've drawn a name 🎁",
    content,
    reason: `You're receiving this because you're in the Secret Santa “${name}” on ${appName}.`,
  });
  const text = m.plainText([
    redraw ? `Names were drawn again for "${name}", so please ignore any earlier match.` : null,
    `You're the Secret Santa for ${recipient} in "${name}".`,
    facts.when ? `Exchange day: ${facts.when}` : null,
    facts.budget ? `Budget: about ${facts.budget} per gift` : null,
    listLink ? `${recipient}'s wish list: ${listLink}` : `${recipient} hasn't shared a wish list yet: ${exchangeLink}`,
    "Keep it secret! Only you know who you're buying for.",
    `— ${appName}`,
  ]);
  return { subject: `🎅 You're the Secret Santa for ${recipient}`, html, text };
}

function exchangeListReadyEmail({ appName, appUrl, exchange, recipient, listLink }) {
  const name = exchange.getString("name");
  const content =
    m.paragraph(`Good news: <strong>${m.esc(recipient)}</strong> just shared their wish list in <strong>“${m.esc(name)}”</strong>.`) +
    m.button(listLink, `See ${recipient}'s wish list`) +
    m.note("🤫 They still don't know you're their Secret Santa.");
  const html = m.render({
    appName,
    appUrl,
    preheader: `${recipient} shared their wish list.`,
    heading: "Your match shared a wish list",
    content,
    reason: `You're receiving this because you're in the Secret Santa “${name}” on ${appName}.`,
  });
  const text = m.plainText([`${recipient} shared their wish list in "${name}": ${listLink}`, `— ${appName}`]);
  return { subject: `${recipient} shared their wish list 🎁`, html, text };
}

function duration(seconds) {
  const s = Number(seconds) || 0;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} minutes`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
}

// Templates use PocketBase placeholders ({APP_NAME}, {APP_URL}, {TOKEN}, {OTP}, {ALERT_INFO}).
function authTemplates(users) {
  const base = { appName: "{APP_NAME}", appUrl: "{APP_URL}" };
  const verifyLink = "{APP_URL}/verify/{TOKEN}";
  const resetLink = "{APP_URL}/reset-password/{TOKEN}";
  const changeLink = "{APP_URL}/confirm-email/{TOKEN}";

  return {
    verification: {
      subject: "Confirm your email for {APP_NAME}",
      body: m.render({
        ...base,
        preheader: "One click and you're all set.",
        heading: "Confirm your email address",
        content:
          m.paragraph("Welcome to {APP_NAME}! 👋 Please confirm this is your email address so you can receive list invitations, reservation reminders and password resets.") +
          m.button(verifyLink, "Confirm my email") +
          m.fallbackLink(verifyLink) +
          m.note(`This link expires in ${duration(users.verificationToken.duration)}. If you didn't sign up for {APP_NAME}, you can safely ignore this email — no account will be activated.`),
        reason: "You're receiving this because this address was used to sign up for {APP_NAME}.",
      }),
    },
    reset: {
      subject: "Reset your {APP_NAME} password",
      body: m.render({
        ...base,
        preheader: "Choose a new password for your account.",
        heading: "Reset your password",
        content:
          m.paragraph("We received a request to reset the password for your {APP_NAME} account. Click the button below to choose a new one.") +
          m.button(resetLink, "Choose a new password") +
          m.fallbackLink(resetLink) +
          m.note(`For your security, this link expires in ${duration(users.passwordResetToken.duration)} and can only be used once. If you didn't ask to reset your password, ignore this email — your password won't change.`),
        reason: "You're receiving this because someone asked to reset the password for this account.",
      }),
    },
    emailChange: {
      subject: "Confirm your new email for {APP_NAME}",
      body: m.render({
        ...base,
        preheader: "Confirm the new email address for your account.",
        heading: "Confirm your new email address",
        content:
          m.paragraph("You asked to change the email address on your {APP_NAME} account to this one. Click below to confirm — you'll be asked for your password to finish.") +
          m.button(changeLink, "Confirm new email") +
          m.fallbackLink(changeLink) +
          m.note(`This link expires in ${duration(users.emailChangeToken.duration)}. If you didn't ask for this, ignore this email — your account email won't change.`),
        reason: "You're receiving this because this address was entered as the new email for a {APP_NAME} account.",
      }),
    },
    otp: {
      subject: "Your {APP_NAME} sign-in code",
      body: m.render({
        ...base,
        preheader: "Your one-time sign-in code is inside.",
        heading: "Your sign-in code",
        content:
          m.paragraph("Enter this code to sign in to {APP_NAME}:") +
          m.codeBox("{OTP}") +
          m.note("The code expires shortly and can only be used once. If you didn't try to sign in, you can ignore this email."),
        reason: "You're receiving this because someone asked for a sign-in code for this account.",
      }),
    },
    alert: {
      subject: "New sign-in to your {APP_NAME} account",
      body: m.render({
        ...base,
        preheader: "We noticed a sign-in from a new device or location.",
        heading: "New sign-in detected",
        content:
          m.paragraph("We noticed a sign-in to your {APP_NAME} account from a new device or location:") +
          m.panel(`<div style="font-family:${m.FONT};font-size:14px;line-height:1.6;color:#3f3f46">{ALERT_INFO}</div>`) +
          m.paragraph("<strong>If this was you</strong>, there's nothing to do.") +
          m.paragraph("<strong>If it wasn't</strong>, reset your password right away — that signs out every other device.") +
          m.button("{APP_URL}/forgot", "Reset my password"),
        reason: "You're receiving this security notice for your {APP_NAME} account.",
      }),
    },
  };
}

module.exports = { santaMessageEmail, priceDropEmail, questionAskedEmail, questionAnsweredEmail, shareEmail, reservationEmail, reservationReminderEmail, reservationReleasedEmail, occasionReminderEmail, followDigestEmail, exchangeInviteEmail, exchangeMatchEmail, exchangeListReadyEmail, authTemplates };
