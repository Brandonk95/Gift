// Email design shared by every message the app sends: our own emails (list
// invitations, reservation reminders) and PocketBase's auth emails
// (verification, password reset, …), which are generated from the same layout.
//
// Email clients are picky, so this is table-based HTML with inline styles only.

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
  return /^#[0-9a-f]{6}$/i.test(v) ? v : "#4f46e5";
}

function hostOf(url) {
  const m = /^https?:\/\/([^/:?#]+)/i.exec(String(url || ""));
  return m ? m[1] : "";
}

function paragraph(html) {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body}">${html}</p>`;
}

function button(href, label) {
  const a = accent();
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>
<td align="center" bgcolor="${a}" style="border-radius:10px;background:${a}">
<a href="${esc(href)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px">${esc(label)}</a>
</td></tr></table>`;
}

// Small "button not working?" fallback with the raw link
function fallbackLink(href) {
  return `<p style="margin:0 0 20px;font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted}">Button not working? Copy and paste this link into your browser:<br>
<a href="${esc(href)}" style="color:${accent()};word-break:break-all;text-decoration:underline">${esc(href)}</a></p>`;
}

// A light gray box, e.g. for a list summary or a gift
function panel(innerHtml) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;background:${C.soft};border-radius:12px">
<tr><td style="padding:16px 18px">${innerHtml}</td></tr></table>`;
}

// One row: picture (or emoji), title, detail line, optional right-aligned value
function row({ image, emoji, title, detail, value }) {
  const pic = image
    ? `<img src="${esc(image)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border-radius:10px;object-fit:cover;background:#ffffff;border:1px solid ${C.border}">`
    : `<div style="width:56px;height:56px;line-height:56px;border-radius:10px;background:#ffffff;border:1px solid ${C.border};text-align:center;font-size:26px">${esc(emoji || "🎁")}</div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="56" valign="middle" style="padding:6px 14px 6px 0">${pic}</td>
<td valign="middle" style="padding:6px 0;font-family:${FONT}">
  <div style="font-size:15px;font-weight:600;color:${C.text};line-height:1.35">${esc(title)}</div>
  ${detail ? `<div style="font-size:13px;color:${C.muted};line-height:1.4;margin-top:2px">${esc(detail)}</div>` : ""}
</td>
${value ? `<td valign="middle" align="right" style="padding:6px 0 6px 12px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.text};white-space:nowrap">${esc(value)}</td>` : ""}
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
  const a = accent();
  const appName = esc(opts.appName);
  const host = hostOf(opts.appUrl) || esc(opts.appUrl);
  const pre = esc(opts.preheader || "");
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<!-- giftlist-template:v2 -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${pre}&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;&nbsp;&#8204;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:32px 16px 40px">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 22px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="36" height="36" align="center" valign="middle" bgcolor="${a}" style="width:36px;height:36px;border-radius:10px;background:${a};font-size:18px;line-height:36px">🎁</td>
        <td style="padding-left:10px;font-family:${FONT};font-size:18px;font-weight:700;color:${C.text};letter-spacing:-0.2px">${appName}</td>
      </tr></table>
    </td></tr>

    <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:36px 36px 32px">
      <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;color:${C.text};letter-spacing:-0.3px">${esc(opts.heading)}</h1>
      ${opts.content}
      <p style="margin:24px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.body}">— ${appName}</p>
    </td></tr>

    <tr><td style="padding:22px 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted};text-align:center">
      ${opts.reason ? `${esc(opts.reason)}<br>` : ""}
      <!--giftlist-unsub-->
      Can't find our emails? Check your <strong>spam</strong> or <strong>junk</strong> folder and mark us as “Not spam” so future emails reach your inbox.<br>
      <span style="color:#a1a1aa">${appName}${host ? ` · <a href="${esc(opts.appUrl)}" style="color:#a1a1aa;text-decoration:underline">${host}</a>` : ""}</span>
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
