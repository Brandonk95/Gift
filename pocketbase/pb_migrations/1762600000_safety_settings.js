/// <reference path="../pb_data/types.d.ts" />

// Sensible defaults, applied once (change them any time in the admin dashboard):
// - nightly backups at 3am, keeping the last 7 (Settings → Backups; add S3 there to copy them off the machine)
// - rate limits per IP, mainly so sign-in can't be brute-forced and one person can't burn
//   through the photo search quota (Settings → Application → Rate limiting)
migrate((app) => {
  const settings = app.settings();
  const patch = {};
  if (!settings.backups.cron) patch.backups = { cron: "0 3 * * *", cronMaxKeep: 7 };
  if (!settings.rateLimits.enabled) {
    patch.rateLimits = {
      enabled: true,
      rules: [
        { label: "*:auth", maxRequests: 5, duration: 10 },
        { label: "*:create", maxRequests: 50, duration: 10 },
        { label: "/api/giftlist/preview", maxRequests: 20, duration: 60 },
        { label: "/api/giftlist/images", maxRequests: 10, duration: 60 },
        { label: "/api/giftlist/unsubscribe", maxRequests: 10, duration: 60 },
        { label: "/api/", maxRequests: 300, duration: 10 },
      ],
    };
  }
  if (Object.keys(patch).length) {
    unmarshal(patch, settings);
    app.save(settings);
  }
}, (app) => {
  const settings = app.settings();
  unmarshal({ backups: { cron: "", cronMaxKeep: 3 }, rateLimits: { enabled: false } }, settings);
  app.save(settings);
});
