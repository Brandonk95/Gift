// Email design shared by every message the app sends: our own emails (list
// invitations, reservation reminders) and PocketBase's auth emails
// (verification, password reset, ...), which are generated from the same layout.
//
// Kept deliberately plain, like a note from a person: white page, text first, links
// instead of big colored buttons, no logo banner and no store pictures. Gmail files
// newsletter-looking mail (banners, image grids, buttons, prices next to pictures)
// under Promotions, where people miss it.
//
// Email clients are picky, so this is simple HTML with inline styles only.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = {
  bg: "#f4f4f5",
  card: "#ffffff",
  border: "#e4e4e7",
  text: "#18181b",
  body: "#3f3f46",
  muted: "#71717a",
  soft: "#f4f4f5",
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Brand color for buttons and the logo; override with EMAIL_ACCENT=#rrggbb
function accent() {
  const v = String($os.getenv("EMAIL_ACCENT") || "").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#c8364f";
}

function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ""));
  return m ? m[1] : "";
}

function paragraph(html) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body}">${html}</p>`;
}

// The main link of an email: a plain bold link on its own line
function button(href, label) {
  return `<p style="margin:4px 0 20px;font-family:${FONT};font-size:15px;line-height:1.6"><a href="${esc(href)}" target="_blank" rel="noopener" style="color:${accent()};font-weight:600;text-decoration:underline">${esc(label)} &rarr;</a></p>`;
}

// (used to be a "button not working?" copy of the link; the main link is plain text now)
function fallbackLink() {
  return "";
}

// A quiet aside, e.g. for a list summary or a gift: a thin line on the left
function panel(innerHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
<tr><td style="padding:2px 0 2px 14px;border-left:3px solid ${C.border}">${innerHtml}</td></tr></table>`;
}

// One line: title, detail, optional value on the right. (image/emoji are accepted but
// not shown: product pictures make an email look like an ad.)
function row({ title, detail, value }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="padding:5px 0;font-family:${FONT}">
  <div style="font-size:15px;font-weight:600;color:${C.text};line-height:1.4">${esc(title)}</div>
  ${detail ? `<div style="font-size:13px;color:${C.muted};line-height:1.4">${esc(detail)}</div>` : ""}
</td>
${value ? `<td valign="top" align="right" style="padding:5px 0 5px 12px;font-family:${FONT};font-size:15px;color:${C.body};white-space:nowrap">${esc(value)}</td>` : ""}
</tr></table>`;
}

function note(html) {
  return `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.55;color:${C.muted}">${html}</p>`;
}

function codeBox(code) {
  return `<div style="margin:4px 0 24px;padding:18px;background:${C.soft};border-radius:12px;text-align:center;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${C.text}">${esc(code)}</div>`;
}

/**
 * Full email document.
 * opts: { appName, appUrl, preheader, heading, content (html), reason }
 * appName/appUrl may be PocketBase placeholders like "{APP_NAME}".
 */
function render(opts) {
  const appName = esc(opts.appName);
  const host = hostOf(opts.appUrl) || esc(opts.appUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%">
<!-- giftlist-template:v3 -->
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:24px 20px 32px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td>
      <h1 style="margin:0 0 14px;font-family:${FONT};font-size:19px;line-height:1.35;font-weight:700;color:${C.text}">${esc(opts.heading)}</h1>
      ${opts.content}
      <p style="margin:20px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body}">${appName}</p>
    </td></tr>
    <tr><td style="padding:28px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
      ${opts.reason ? `${esc(opts.reason)}<br>` : ""}
      <!--giftlist-unsub-->
      ${host ? `<a href="${esc(opts.appUrl)}" style="color:${C.muted};text-decoration:underline">${host}</a>` : ""}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

// Plain-text alternative (improves deliverability and helps text-only clients)
function plainText(lines) {
  return lines.filter((l) => l !== null && l !== undefined).join("\n\n") + "\n";
}

module.exports = { FONT, esc, accent, paragraph, button, fallbackLink, panel, row, note, codeBox, render, plainText };
