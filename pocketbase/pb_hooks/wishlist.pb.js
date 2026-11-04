/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Import an Amazon wish list: returns its gifts so "Add many gifts" can add them
// all at once. Amazon sometimes refuses servers (a robot check); then the person
// is asked to paste the item links instead.
// ---------------------------------------------------------------------------
routerAdd(
  "GET",
  "/api/giftlist/wishlist",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const scrape = require(`${__hooks}/lib/scrape.js`);
    const url = String(e.request.url.query().get("url") || "").trim();
    if (!u.isPublicHttpUrl(url) || !scrape.isWishlistUrl(url)) {
      throw new BadRequestError("That isn't an Amazon wish list link. Open the wish list on Amazon, press Share (or “Send list to others”), copy the link and paste it here.");
    }
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const items = [];
    const seen = {};
    let next = url;
    for (let page = 0; next && page < 10 && items.length < 200; page++) {
      if (!u.isPublicHttpUrl(next)) break;
      let res;
      try {
        res = $http.send({ url: next, method: "GET", timeout: 12, headers });
      } catch (_) {
        if (!page) throw new BadRequestError("Amazon didn't answer in time. Try again in a minute, or paste the gift links instead.");
        break;
      }
      const html = toString(res.body, 3 * 1024 * 1024);
      if (scrape.blockedReason(html, res.statusCode) || res.statusCode >= 400) {
        if (!page) {
          throw new BadRequestError("Amazon wouldn't show that wish list to this server (it asked for a robot check, or the list is private). Make sure the list is set to Public or Shared, or open each gift and paste the links instead.");
        }
        break;
      }
      const r = scrape.wishlistPage(next, html);
      for (const it of r.items) {
        if (seen[it.url]) continue;
        seen[it.url] = true;
        if (it.image && !u.isPublicHttpUrl(it.image)) it.image = "";
        items.push(it);
      }
      next = r.next && r.next !== next ? r.next : "";
    }
    if (!items.length) {
      throw new BadRequestError("No gifts were found on that wish list. If it has gifts, make sure it's set to Public or Shared on Amazon, or paste the gift links instead.");
    }
    return e.json(200, { items });
  },
  $apis.requireAuth()
);
