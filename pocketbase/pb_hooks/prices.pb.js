/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Price drops: each gift with a link and a price is re-checked about once a week.
// The store's current price is shown next to the listed one when it's lower, and
// whoever reserved or chipped in on the gift gets an email. Stores that block
// automatic previews (like Amazon) are simply skipped.
// ---------------------------------------------------------------------------

// Changing the link or price starts the checks over
onRecordUpdateRequest((e) => {
  const o = e.record.original();
  if (o.getString("url") !== e.record.getString("url") || o.getFloat("price") !== e.record.getFloat("price")) {
    e.record.set("current_price", 0);
    e.record.set("price_alerted", 0);
    e.record.set("price_checked", "");
  }
  e.next();
}, "items");

// A few gifts every hour, oldest check first, so stores aren't hammered
cronAdd("giftlist_price_checks", "30 * * * *", () => {
  const u = require(`${__hooks}/lib/util.js`);
  const scrape = require(`${__hooks}/lib/scrape.js`);
  const weekAgo = u.pbDate(Date.now() - 7 * 864e5);
  let due = [];
  try {
    due = $app.findRecordsByFilter(
      "items",
      "url != '' && price > 0 && received = false && list.archived = false && (price_checked = '' || price_checked < {:weekAgo})",
      "price_checked",
      15,
      0,
      { weekAgo }
    );
  } catch (err) {
    console.log("[giftlist] price checks failed:", err);
    return;
  }

  const defaultCurrency = ($os.getenv("APP_CURRENCY") || "USD").trim().toUpperCase();
  for (const item of due) {
    item.set("price_checked", u.pbDate(Date.now()));
    try {
      const url = item.getString("url");
      if (!u.isPublicHttpUrl(url)) throw new Error("not a public link");
      const res = $http.send({
        url,
        method: "GET",
        timeout: 10,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = toString(res.body, 2 * 1024 * 1024);
      if (res.statusCode >= 400 || scrape.blockedReason(html, res.statusCode)) throw new Error("blocked or missing");
      const d = u.withShopify(scrape, scrape.extract(url, html), url, html);
      const list = $app.findRecordById("lists", item.getString("list"));
      const currency = (list.getString("currency") || defaultCurrency).toUpperCase();
      if (!d.price || (d.currency && d.currency.toUpperCase() !== currency)) throw new Error("no comparable price");

      const listed = item.getFloat("price");
      item.set("current_price", d.price);
      if (d.price >= listed) {
        item.set("price_alerted", 0); // back up: a later drop alerts again
      } else if (d.price <= listed * 0.97 && (!item.getFloat("price_alerted") || d.price < item.getFloat("price_alerted"))) {
        item.set("price_alerted", d.price);
        notifyBuyers($app, list, item, listed, d.price, currency);
      }
    } catch (_) {
      // try again next week
    }
    try {
      $app.save(item);
    } catch (err) {
      console.log("[giftlist] saving price check failed:", err);
    }
  }

  function notifyBuyers(app, list, item, listed, now, currency) {
    if (!u.canNotify(app)) return;
    const mails = require(`${__hooks}/lib/mails.js`);
    const people = {};
    for (const r of app.findRecordsByFilter("reservations", "item = {:id}", "", 0, 0, { id: item.id })) people[r.getString("user")] = true;
    for (const p of app.findRecordsByFilter("pledges", "item = {:id}", "", 0, 0, { id: item.id })) people[p.getString("user")] = true;
    for (const id in people) {
      try {
        const user = app.findRecordById("users", id);
        const mail = mails.priceDropEmail({ appName: app.settings().meta.appName, appUrl: u.appUrl(app), list, item, listed, now, currency });
        u.sendUserMail(app, user, "prices", mail);
      } catch (err) {
        console.log("[giftlist] price drop email failed:", err);
      }
    }
  }
});
