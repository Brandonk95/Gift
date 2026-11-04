/// <reference path="../pb_data/types.d.ts" />

// ---------------------------------------------------------------------------
// Apply app + SMTP settings from environment variables on every start, so the
// container can be configured entirely through docker-compose / .env.
// Settings changed in the admin UI stay in effect for anything not set here.
// ---------------------------------------------------------------------------
onBootstrap((e) => {
  e.next();

  const env = (k) => ($os.getenv(k) || "").trim();
  const settings = e.app.settings();
  let changed = false;
  const set = (obj, key, value) => {
    if (obj[key] !== value) {
      obj[key] = value;
      changed = true;
    }
  };

  if (env("APP_NAME")) set(settings.meta, "appName", env("APP_NAME"));
  // replace PocketBase's placeholder name on a fresh install
  else if (!settings.meta.appName || settings.meta.appName === "Acme") set(settings.meta, "appName", "Gift List");
  if (env("APP_URL")) set(settings.meta, "appURL", env("APP_URL").replace(/\/+$/, ""));
  if (env("SMTP_SENDER_ADDRESS")) set(settings.meta, "senderAddress", env("SMTP_SENDER_ADDRESS"));
  if (env("SMTP_SENDER_NAME")) set(settings.meta, "senderName", env("SMTP_SENDER_NAME"));

  if (env("SMTP_HOST")) {
    set(settings.smtp, "enabled", true);
    set(settings.smtp, "host", env("SMTP_HOST"));
    set(settings.smtp, "port", parseInt(env("SMTP_PORT") || "587", 10));
    set(settings.smtp, "username", env("SMTP_USERNAME"));
    if (env("SMTP_PASSWORD")) set(settings.smtp, "password", env("SMTP_PASSWORD"));
    // tls=true means implicit TLS (usually port 465); false uses STARTTLS when offered
    const tls = env("SMTP_TLS") ? /^(1|true|yes)$/i.test(env("SMTP_TLS")) : settings.smtp.port === 465;
    set(settings.smtp, "tls", tls);
    if (env("SMTP_AUTH_METHOD")) set(settings.smtp, "authMethod", env("SMTP_AUTH_METHOD").toUpperCase());
    if (env("SMTP_LOCAL_NAME")) set(settings.smtp, "localName", env("SMTP_LOCAL_NAME"));
  }

  if (changed) {
    e.app.save(settings);
    console.log("[giftlist] applied settings from environment");
  }

  // Install the app's designed auth emails (verification, password reset, …).
  // Only replaces PocketBase's stock templates or our own earlier versions —
  // templates edited in the admin UI are left alone if the
  // "giftlist-template" marker comment was removed from them.
  try {
    const users = e.app.findCollectionByNameOrId("users");
    const t = require(`${__hooks}/lib/mails.js`).authTemplates(users);
    const replaceable = (body) => !String(body || "").trim() || body.indexOf("{APP_NAME} team") >= 0 || body.indexOf("giftlist-template") >= 0;
    const targets = [
      [users.verificationTemplate, t.verification],
      [users.resetPasswordTemplate, t.reset],
      [users.confirmEmailChangeTemplate, t.emailChange],
      [users.otp.emailTemplate, t.otp],
      [users.authAlert.emailTemplate, t.alert],
    ];
    let tplChanged = false;
    for (const [cur, next] of targets) {
      if (replaceable(cur.body) && (cur.body !== next.body || cur.subject !== next.subject)) {
        cur.subject = next.subject;
        cur.body = next.body;
        tplChanged = true;
      }
    }
    if (tplChanged) {
      e.app.save(users);
      console.log("[giftlist] installed email templates");
    }
  } catch (err) {
    console.log("[giftlist] could not install email templates:", err);
  }
});

// ---------------------------------------------------------------------------
// Denormalized display names (user records are private by default).
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const { displayName } = require(`${__hooks}/lib/util.js`);
  if (e.auth) e.record.set("owner_name", displayName(e.auth));
  e.next();
}, "lists");

onRecordUpdateRequest((e) => {
  const { displayName } = require(`${__hooks}/lib/util.js`);
  if (e.auth) e.record.set("owner_name", displayName(e.auth));
  e.next();
}, "lists");

onRecordCreateRequest((e) => {
  const { displayName } = require(`${__hooks}/lib/util.js`);
  if (e.auth) e.record.set("reserver_name", displayName(e.auth));
  e.next();
}, "reservations");

// Keep list owner names in sync when a user renames themselves.
onRecordAfterUpdateSuccess((e) => {
  const { displayName } = require(`${__hooks}/lib/util.js`);
  const name = displayName(e.record);
  try {
    const lists = e.app.findRecordsByFilter("lists", "owner = {:id} && owner_name != {:name}", "", 0, 0, {
      id: e.record.id,
      name,
    });
    for (const l of lists) {
      l.set("owner_name", name);
      e.app.save(l);
    }
  } catch (err) {
    console.log("[giftlist] owner_name sync failed:", err);
  }
  e.next();
}, "users");

// ---------------------------------------------------------------------------
// Confirmation email to the person who reserved a gift.
// ---------------------------------------------------------------------------
onRecordAfterCreateSuccess((e) => {
  e.next();

  const u = require(`${__hooks}/lib/util.js`);
  if (!u.smtpEnabled(e.app)) return;

  try {
    const user = e.app.findRecordById("users", e.record.getString("user"));
    const item = e.app.findRecordById("items", e.record.getString("item"));
    const list = e.app.findRecordById("lists", item.getString("list"));
    const mail = require(`${__hooks}/lib/mails.js`).reservationEmail({
      appName: e.app.settings().meta.appName,
      appUrl: u.appUrl(e.app),
      currency: list.getString("currency") || ($os.getenv("APP_CURRENCY") || "USD").trim(),
      list,
      item,
    });
    u.sendUserMail(e.app, user, "reservations", mail);
  } catch (err) {
    console.log("[giftlist] reservation email failed:", err);
  }
}, "reservations");

// ---------------------------------------------------------------------------
// Friendlier shortcut to the PocketBase admin dashboard (its sign-in page).
// ---------------------------------------------------------------------------
routerAdd("GET", "/admin", (e) => e.redirect(302, "/_/"));
routerAdd("GET", "/admin/{path...}", (e) => e.redirect(302, "/_/"));

// ---------------------------------------------------------------------------
// Web app manifest, so the app can be installed and appears in the phone's share
// menu (links shared to it open /share). Served here to use APP_NAME.
// ---------------------------------------------------------------------------
routerAdd("GET", "/manifest.webmanifest", (e) => {
  const name = e.app.settings().meta.appName || "Gift List";
  e.response.header().set("Content-Type", "application/manifest+json");
  return e.string(
    200,
    JSON.stringify({
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: "Wish lists, reservations and Secret Santa",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f8f4ee",
      theme_color: "#c8364f",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    })
  );
});

// ---------------------------------------------------------------------------
// Public config for the SPA.
// ---------------------------------------------------------------------------
routerAdd("GET", "/api/giftlist/config", (e) => {
  const s = e.app.settings();
  return e.json(200, {
    appName: s.meta.appName,
    smtpEnabled: !!s.smtp.enabled,
    currency: ($os.getenv("APP_CURRENCY") || "USD").trim().toUpperCase(),
    photoSearch: !!($os.getenv("BRAVE_SEARCH_KEY") || "").trim(),
    reservationDays: require(`${__hooks}/lib/util.js`).RESERVATION_DAYS,
  });
});

// ---------------------------------------------------------------------------
// Email a list's share link to friends.
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/giftlist/lists/{id}/share",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);

    if (!u.smtpEnabled(e.app)) {
      throw new BadRequestError("Email isn't set up on this server yet, so invitations can't be sent. Copy the share link and send it yourself, or ask the site admin to configure SMTP.");
    }

    let list;
    try {
      list = e.app.findRecordById("lists", e.request.pathValue("id"));
    } catch (_) {
      throw new NotFoundError("This list no longer exists. It may have been deleted — refresh the page.");
    }
    if (list.getString("owner") !== e.auth.id) {
      throw new ForbiddenError("You can only send invitations for lists you own.");
    }
    if (list.getBool("private")) {
      throw new BadRequestError("This is a private ideas board, so it can't be shared. Turn off “Private ideas board” in the list settings first.");
    }

    const body = e.requestInfo().body || {};
    const emails = u.parseEmails(body.emails, 25);

    const note = String(body.message || "").slice(0, 1000);
    const from = u.displayName(e.auth);
    const link = `${u.appUrl(e.app)}/s/${list.getString("share_token")}`;
    const mail = require(`${__hooks}/lib/mails.js`).shareEmail({
      appName: e.app.settings().meta.appName,
      appUrl: u.appUrl(e.app),
      currency: list.getString("currency") || ($os.getenv("APP_CURRENCY") || "USD").trim(),
      from,
      list,
      items: e.app.findRecordsByFilter("items", "list = {:l}", "sort", 0, 0, { l: list.id }),
      note,
      link,
    });

    const failed = [];
    for (const addr of emails) {
      try {
        u.sendMail(e.app, [addr], mail.subject, mail.html, mail.text);
      } catch (err) {
        console.log("[giftlist] share email failed for", addr, err);
        failed.push(addr);
      }
    }

    if (failed.length === emails.length) {
      throw new BadRequestError("The mail server refused to send the invitations, so nobody was emailed. The site admin should check the SMTP settings (host, port, username, password and TLS). Meanwhile you can copy the share link and send it yourself.");
    }
    return e.json(200, { sent: emails.length - failed.length, failed });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Photo search for the item editor, for stores that don't give a usable picture
// (Amazon, sites that block previews). Uses the Brave Search API's image search;
// set BRAVE_SEARCH_KEY to turn it on (https://brave.com/search/api).
// ---------------------------------------------------------------------------
routerAdd(
  "GET",
  "/api/giftlist/images",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const key = ($os.getenv("BRAVE_SEARCH_KEY") || "").trim();
    if (!key) {
      throw new BadRequestError("Photo search isn't set up on this server. The site admin can turn it on by adding a free Brave Search API key (BRAVE_SEARCH_KEY).");
    }
    const q = String(e.request.url.query().get("q") || "").replace(/\s+/g, " ").trim().slice(0, 150);
    if (q.length < 2) throw new BadRequestError("Type what the gift is first, then search for photos of it.");

    // the same search within 3 days reuses the earlier results to save API quota
    const cacheKey = "giftlist:photos:" + q.toLowerCase();
    const cached = e.app.store().get(cacheKey);
    if (cached && Date.now() - cached.at < 3 * 864e5) return e.json(200, { query: q, photos: cached.photos });

    let res;
    try {
      res = $http.send({
        url: "https://api.search.brave.com/res/v1/images/search?count=30&safesearch=strict&q=" + encodeURIComponent(q),
        method: "GET",
        timeout: 10,
        headers: { Accept: "application/json", "X-Subscription-Token": key },
      });
    } catch (err) {
      throw new BadRequestError("Photo search didn't respond in time. Try again, or paste an image URL instead.");
    }
    let body = {};
    try {
      body = JSON.parse(toString(res.body)) || {};
    } catch (_) {}
    if (res.statusCode !== 200) {
      const code = (body.error && body.error.code) || "";
      console.log("[giftlist] photo search failed:", res.statusCode, code);
      if (/TOKEN_INVALID|TOKEN_EXPIRED/i.test(code) || res.statusCode === 401 || res.statusCode === 403) {
        throw new BadRequestError("Photo search isn't working because the server's Brave Search API key was rejected. The site admin should check BRAVE_SEARCH_KEY.");
      }
      if (res.statusCode === 429 || /RATE_LIMITED|QUOTA/i.test(code)) {
        throw new BadRequestError("Photo search has hit its limit for now. Try again in a little while, or paste an image URL instead.");
      }
      throw new BadRequestError(`Photo search failed (error ${res.statusCode}). Try again, or paste an image URL instead.`);
    }

    const seen = {};
    const photos = [];
    for (const r of body.results || []) {
      const props = r.properties || {};
      const image = props.url || "";
      const thumbnail = (r.thumbnail && r.thumbnail.src) || image;
      if (!u.isPublicHttpUrl(image) || !u.isPublicHttpUrl(thumbnail)) continue;
      const width = props.width || (r.thumbnail && r.thumbnail.width) || 0;
      const height = props.height || (r.thumbnail && r.thumbnail.height) || 0;
      if (width && height && (width < 200 || height < 200)) continue; // icons, tiny thumbnails
      const k = String(image).replace(/[?#].*$/, "");
      if (seen[k]) continue;
      seen[k] = true;
      const host = String(r.source || (r.meta_url && r.meta_url.hostname) || "").replace(/^www\./, "");
      photos.push({ image, thumbnail, title: String(r.title || "").slice(0, 120), source: host, width, height });
      if (photos.length >= 12) break;
    }
    if (photos.length) e.app.store().set(cacheKey, { at: Date.now(), photos });
    return e.json(200, { query: q, photos });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Fetch title / image / price from a product page to prefill the item editor.
// ---------------------------------------------------------------------------
routerAdd(
  "GET",
  "/api/giftlist/preview",
  (e) => {
    const u = require(`${__hooks}/lib/util.js`);
    const url = String(e.request.url.query().get("url") || "").trim();
    if (!u.isPublicHttpUrl(url)) {
      throw new BadRequestError("Autofill needs a full public web address starting with http:// or https:// (for example https://store.com/product). Links to local or private network addresses aren't allowed.");
    }

    const scrape = require(`${__hooks}/lib/scrape.js`);
    // When a store blocks us we still return what the link itself tells us
    // (a name guessed from the URL), so the form isn't left empty.
    const partial = (reason) => {
      return e.json(200, {
        title: scrape.titleFromUrl(url),
        description: "",
        image: "",
        images: [],
        price: null,
        currency: "",
        brand: "",
        siteName: "",
        url: scrape.cleanUrl(url),
        blocked: true,
        message: reason,
      });
    };

    let res;
    try {
      res = $http.send({
        url,
        method: "GET",
        timeout: 12,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      return partial("The store didn't respond in time, so only the name was guessed from the link. Add the price and picture yourself.");
    }
    if (res.statusCode === 404 || res.statusCode === 410) {
      throw new BadRequestError("That page doesn't exist (error " + res.statusCode + "). Check the link for typos.");
    }

    const html = toString(res.body, 2 * 1024 * 1024);
    const blocked = scrape.blockedReason(html, res.statusCode);
    const d = scrape.extract(url, html);
    if (blocked) {
      return partial(
        "This store blocks automatic previews" +
          (blocked === "captcha" ? " (it asked for a robot check)" : ` (error ${res.statusCode})`) +
          ", so the details were guessed from the link. Check them, and add the price yourself. Tip: on the store page, right-click the product picture, choose “Copy image address” and paste it under the picture."
      );
    }
    if (res.statusCode >= 400) {
      throw new BadRequestError(`That page returned an error (${res.statusCode}), so its details couldn't be read. Fill them in manually.`);
    }
    u.withShopify(scrape, d, url, html);
    if (!d.title) d.title = scrape.titleFromUrl(url);
    d.images = d.images.filter((i) => u.isPublicHttpUrl(i));
    d.image = d.images[0] || "";
    return e.json(200, d);
  },
  $apis.requireAuth()
);
