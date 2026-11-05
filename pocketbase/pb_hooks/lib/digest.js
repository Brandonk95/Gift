// Nightly "new gifts on lists you follow" emails. One email per person covering every
// list they follow, so adding ten gifts in an evening doesn't send ten emails.

function sendDigests(app) {
  const u = require(`${__hooks}/lib/util.js`);
  const mails = require(`${__hooks}/lib/mails.js`);
  if (!u.canNotify(app)) return { emailed: 0, failed: 0 };

  const runAt = u.pbDate(Date.now());
  const appName = app.settings().meta.appName;
  const appUrl = u.appUrl(app);
  const defaultCurrency = ($os.getenv("APP_CURRENCY") || "USD").trim();

  // follows grouped by the person who'll get the email
  const byUser = {};
  for (const f of app.findRecordsByFilter("follows", "notify = true", "", 0, 0)) {
    (byUser[f.getString("user")] ||= []).push(f);
  }

  let emailed = 0, failed = 0;
  for (const userId in byUser) {
    let user;
    try {
      user = app.findRecordById("users", userId);
    } catch (_) {
      continue;
    }
    const groups = [];
    for (const f of byUser[userId]) {
      let list;
      try {
        list = app.findRecordById("lists", f.getString("list"));
      } catch (_) {
        continue;
      }
      // the owner reset the share link (access revoked), archived the list, or it's their own
      if (f.getString("token") !== list.getString("share_token") || list.getBool("archived") || list.getBool("private")) continue;
      if (u.ownsList(list, userId) && !user.getBool("tester")) continue;

      const since = f.getString("notified_at") || f.getString("created");
      const items = app.findRecordsByFilter("items", "list = {:list} && created > {:since} && received = false", "created", 50, 0, { list: list.id, since });
      if (items.length) {
        groups.push({ list, items, link: `${appUrl}/s/${list.getString("share_token")}`, currency: list.getString("currency") || defaultCurrency });
      }
    }

    if (groups.length) {
      try {
        const mail = mails.followDigestEmail({ appName, appUrl, groups });
        if (u.sendUserMail(app, user, "digest", mail)) emailed++;
      } catch (err) {
        failed++;
        console.log("[giftlist] follow digest failed:", err);
        continue; // leave the cursor alone so tomorrow's email includes these gifts
      }
    }
    for (const f of byUser[userId]) {
      f.set("notified_at", runAt);
      app.save(f);
    }
  }
  return { emailed, failed };
}

// A week before a list's date, remind its followers (once per date)
const OCCASION_DAYS = 7;

function localDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  const pad = (n) => (n < 10 ? "0" : "") + n;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// gifts nobody has reserved or chipped in on yet
function openGifts(app, list) {
  let open = 0;
  for (const it of app.findRecordsByFilter("items", "list = {:list} && received = false", "", 0, 0, { list: list.id })) {
    const reserved = app.findRecordsByFilter("reservations", "item = {:id}", "", 1, 0, { id: it.id }).length;
    const pledged = app.findRecordsByFilter("pledges", "item = {:id}", "", 1, 0, { id: it.id }).length;
    if (!reserved && !pledged) open++;
  }
  return open;
}

function sendOccasionReminders(app) {
  const u = require(`${__hooks}/lib/util.js`);
  if (!u.canNotify(app)) return { emailed: 0, failed: 0 };
  const mails = require(`${__hooks}/lib/mails.js`);
  const target = localDate(OCCASION_DAYS);
  const lists = app.findRecordsByFilter("lists", "archived = false && private = false && event_date >= {:from} && event_date <= {:to}", "", 0, 0, {
    from: `${target} 00:00:00.000Z`,
    to: `${target} 23:59:59.999Z`,
  });
  let emailed = 0, failed = 0;
  for (const list of lists) {
    const date = list.getString("event_date").slice(0, 10);
    const follows = app.findRecordsByFilter("follows", "list = {:list} && notify = true && occasion_reminded != {:date}", "", 0, 0, { list: list.id, date });
    if (!follows.length) continue;
    const open = openGifts(app, list);
    const link = `${u.appUrl(app)}/s/${list.getString("share_token")}`;
    for (const f of follows) {
      try {
        if (f.getString("token") !== list.getString("share_token")) continue;
        const user = app.findRecordById("users", f.getString("user"));
        if (u.ownsList(list, user.id) && !user.getBool("tester")) continue;
        const mail = mails.occasionReminderEmail({ appName: app.settings().meta.appName, appUrl: u.appUrl(app), list, days: OCCASION_DAYS, open, link });
        if (u.sendUserMail(app, user, "occasions", mail)) emailed++;
        f.set("occasion_reminded", date);
        app.save(f);
      } catch (err) {
        failed++;
        console.log("[giftlist] occasion reminder failed:", err);
      }
    }
  }
  return { emailed, failed };
}

module.exports = { sendDigests, sendOccasionReminders };
