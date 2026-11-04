// Helpers for previews.pb.js: the web app's index.html with link-preview tags.

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// index.html from the public folder (Docker: /pb/pb_public, next to pb_hooks)
function indexHtml() {
  const dirs = [($os.getenv("PB_PUBLIC_DIR") || "").trim(), `${__hooks}/../pb_public`, "pb_public"].filter(Boolean);
  for (const d of dirs) {
    try {
      return toString($os.readFile(`${d}/index.html`));
    } catch (_) {}
  }
  return "";
}

function baseUrl(e) {
  const fromSettings = (e.app.settings().meta.appURL || "").replace(/\/+$/, "");
  if (fromSettings) return fromSettings;
  const proto = e.request.header.get("X-Forwarded-Proto") || (e.request.tls ? "https" : "http");
  return `${proto}://${e.request.host}`;
}

function longDate(pbDate) {
  if (!pbDate) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(pbDate);
  return m ? `${months[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}` : "";
}

// meta: { url, title?, description?, image? } (paths are relative to the site)
function page(e, meta) {
  const html = indexHtml();
  if (!html) return e.string(404, "Not found");
  const app = e.app.settings().meta.appName || "Gift List";
  const base = baseUrl(e);
  const abs = (u) => (/^https?:/.test(u) ? u : base + u);
  const title = meta.title || app;
  const tags = [
    `<meta property="og:site_name" content="${esc(app)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${esc(abs(meta.url))}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    meta.description ? `<meta property="og:description" content="${esc(meta.description)}" />` : "",
    meta.description ? `<meta name="description" content="${esc(meta.description)}" />` : "",
    meta.image ? `<meta property="og:image" content="${esc(abs(meta.image))}" />` : "",
    `<meta name="twitter:card" content="${meta.image ? "summary_large_image" : "summary"}" />`,
  ]
    .filter(Boolean)
    .join("\n    ");
  const out = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title ? `${meta.title} · ${app}` : app)}</title>\n    ${tags}`);
  e.response.header().set("Cache-Control", "no-cache");
  return e.html(200, out);
}

module.exports = { page, longDate, esc };
