// Parts of the app that can be switched off on a server. Both are off unless turned on
// in the environment:
//   FEATURE_SECRET_SANTA=true   Secret Santa gift exchanges
//   FEATURE_GROUPS=true         family groups
// Switching one off hides it in the app and refuses its API; nothing is deleted, so
// turning it back on brings everything back as it was.

function on(name) {
  return /^(1|true|yes|on)$/i.test(String($os.getenv(name) || "").trim());
}

function features() {
  return { santa: on("FEATURE_SECRET_SANTA"), groups: on("FEATURE_GROUPS") };
}

// API paths that belong to each feature
const PATHS = {
  santa: ["/api/giftlist/exchanges", "/api/giftlist/join/", "/api/collections/exchanges/", "/api/collections/exchange_members/", "/api/collections/exchange_messages/"],
  groups: ["/api/giftlist/groups", "/api/collections/groups/", "/api/collections/group_members/"],
};

// The feature a request path belongs to when that feature is off, else ""
function blockedBy(path) {
  const f = features();
  const p = String(path || "") + "/";
  for (const name of Object.keys(PATHS)) {
    if (!f[name] && PATHS[name].some((prefix) => p.startsWith(prefix))) return name;
  }
  return "";
}

module.exports = { features, blockedBy };
