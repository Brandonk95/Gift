// Product details from a store page, for the item editor's Autofill.
//
// Sources, best first: schema.org JSON-LD (most stores), Open Graph / product
// meta tags, microdata (itemprop), a few store-specific patterns, and finally
// the page <title>. Pure JS with no PocketBase globals, so it can be tested in Node.

const MAX_IMAGES = 8;

function decode(s) {
  return String(s == null ? "" : s)
    .replace(/&#(\d+);/g, (_, n) => safeChar(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function safeChar(code) {
  try {
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  } catch (_) {
    return "";
  }
}

function stripTags(s) {
  return decode(String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "));
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// a quoted attribute value: "…" or '…' (group 1 or 2)
const VALUE = `(?:"([^"]*)"|'([^']*)')`;

// <meta property|name|itemprop="key" content="…"> in either attribute order
function meta(html, keys) {
  for (const key of keys) {
    const k = escapeRe(key);
    const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*${VALUE}`, "i");
    const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*${VALUE}[^>]*?(?:property|name|itemprop)\\s*=\\s*["']${k}["']`, "i");
    const m = re1.exec(html) || re2.exec(html);
    const v = m && (m[1] != null ? m[1] : m[2]);
    if (v && v.trim()) return decode(v);
  }
  return "";
}

function metaAll(html, key) {
  const k = escapeRe(key);
  const out = [];
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${k}["'][^>]*?content\\s*=\\s*${VALUE}`, "gi");
  let m;
  while ((m = re.exec(html)) && out.length < MAX_IMAGES) out.push(decode(m[1] != null ? m[1] : m[2]));
  return out;
}

function linkHref(html, rel) {
  const r = escapeRe(rel);
  const m =
    new RegExp(`<link[^>]+rel\\s*=\\s*["']${r}["'][^>]*?href\\s*=\\s*["']([^"']+)["']`, "i").exec(html) ||
    new RegExp(`<link[^>]+href\\s*=\\s*["']([^"']+)["'][^>]*?rel\\s*=\\s*["']${r}["']`, "i").exec(html);
  return m ? decode(m[1]) : "";
}

function absolutize(base, url) {
  url = String(url || "").trim();
  if (!url || /^data:/i.test(url)) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const origin = /^(https?:)\/\/[^/]+/i.exec(base);
  if (!origin) return "";
  if (url.startsWith("//")) return origin[1] + url;
  if (url.startsWith("/")) return origin[0] + url;
  return base.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + url;
}

// "1.299,00 €", "$1,299.00", "1299" → 1299
function parsePrice(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : null;
  let s = String(raw).replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastComma > lastDot) {
    // comma is the decimal separator if followed by 1–2 digits, else a thousands separator
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, "");
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, "");
  }
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const SYMBOLS = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "C$": "CAD", A$: "AUD", "R$": "BRL", kr: "SEK", "zł": "PLN", "₽": "RUB", "₺": "TRY" };

function currencyFromText(s) {
  s = String(s || "");
  const code = /\b([A-Z]{3})\b/.exec(s);
  if (code && /^(USD|EUR|GBP|CAD|AUD|NZD|JPY|CHF|SEK|NOK|DKK|PLN|INR|BRL|MXN|KRW|CNY|RUB|TRY|ZAR)$/.test(code[1])) return code[1];
  for (const sym of ["C$", "A$", "R$", "zł", "kr", "$", "€", "£", "¥", "₹", "₩", "₽", "₺"]) if (s.indexOf(sym) >= 0) return SYMBOLS[sym];
  return "";
}

// ----- JSON-LD ---------------------------------------------------------------

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, "").replace(/^\/\*<!\[CDATA\[\*\/|\/\*\]\]>\*\/$/g, "");
    try {
      out.push(JSON.parse(raw));
    } catch (_) {
      // some sites emit raw newlines inside strings
      try {
        out.push(JSON.parse(raw.replace(/[\r\n\t]+/g, " ")));
      } catch (_) {}
    }
  }
  return out;
}

function typeIs(node, names) {
  const t = node && node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list.some((x) => typeof x === "string" && names.indexOf(x.replace(/^.*[/#]/, "")) >= 0);
}

// depth-first search for the first Product-like node
function findProduct(node, depth) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProduct(n, depth + 1);
      if (f) return f;
    }
    return null;
  }
  if (typeIs(node, ["Product", "ProductGroup", "IndividualProduct", "ProductModel", "Book", "Vehicle"])) return node;
  for (const key of ["@graph", "mainEntity", "itemListElement", "item", "about"]) {
    if (node[key]) {
      const f = findProduct(node[key], depth + 1);
      if (f) return f;
    }
  }
  return null;
}

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

function text(v) {
  v = first(v);
  if (v == null) return "";
  if (typeof v === "object") return text(v.name || v["@value"] || "");
  return decode(stripTags(String(v)));
}

function imagesOf(v) {
  const out = [];
  const add = (x) => {
    if (!x) return;
    if (Array.isArray(x)) return x.forEach(add);
    if (typeof x === "string") out.push(x);
    else if (typeof x === "object") add(x.contentUrl || x.url || x.thumbnailUrl);
  };
  add(v);
  return out;
}

function offerOf(product) {
  let offers = product.offers;
  // ProductGroup: use the first variant's offer
  if (!offers && product.hasVariant) offers = first(product.hasVariant) && first(product.hasVariant).offers;
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    if (!o || typeof o !== "object") continue;
    const spec = first(o.priceSpecification) || {};
    const price = parsePrice(o.price != null ? o.price : o.lowPrice != null ? o.lowPrice : spec.price);
    if (price != null) return { price, currency: String(o.priceCurrency || spec.priceCurrency || "").toUpperCase() };
  }
  return { price: null, currency: "" };
}

// ----- store-specific fallbacks ---------------------------------------------

function amazon(html) {
  const out = {};
  const t = /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i.exec(html);
  if (t) out.title = stripTags(t[1]);
  const imgs = [];
  const hi = /"hiRes"\s*:\s*"(https:[^"]+)"/g;
  let m;
  while ((m = hi.exec(html)) && imgs.length < MAX_IMAGES) imgs.push(m[1]);
  const old = /data-old-hires=["'](https:[^"']+)["']/i.exec(html);
  if (old) imgs.unshift(old[1]);
  const land = /"landingImageUrl"\s*:\s*"(https:[^"]+)"/i.exec(html);
  if (land) imgs.push(land[1]);
  if (imgs.length) out.images = imgs;
  const p =
    /<span[^>]+class=["'][^"']*priceToPay[^"']*["'][\s\S]{0,300}?<span class=["']a-offscreen["']>([^<]+)</i.exec(html) ||
    /id=["']corePrice[\s\S]{0,800}?<span class=["']a-offscreen["']>([^<]+)</i.exec(html) ||
    /<span class=["']a-offscreen["']>([^<]*\d[^<]*)</i.exec(html);
  if (p) {
    out.price = parsePrice(p[1]);
    out.currency = currencyFromText(p[1]);
  }
  const brand = /id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (brand) out.brand = stripTags(brand[1]).replace(/^(Visit the|Brand:)\s*/i, "").replace(/\s*Store$/i, "");
  return out;
}

// ----- page title clean-up ---------------------------------------------------

function cleanTitle(title, siteName, host) {
  let t = decode(title);
  if (!t) return "";
  t = t.replace(/^Amazon\.[a-z.]+\s*:\s*/i, "").replace(/\s*:\s*Amazon\.[a-z.]+.*$/i, "");
  t = t.replace(/\s*[+|-]?\s*Free (Shipping|Delivery)\b.*$/i, "");
  // drop " | Store", " - Store", " – Store" suffixes that name the site
  const base = String(host || "").replace(/^www\./, "").split(".")[0].toLowerCase();
  const parts = t.split(/\s+[|–—•·-]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "");
    const site = String(siteName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if ((site && (last === site || last.indexOf(site) >= 0 || site.indexOf(last) >= 0)) || (base && last.indexOf(base) >= 0) || last.length <= 3) {
      parts.pop();
      t = parts.join(" - ");
    }
  }
  // Amazon-style category suffix ": Electronics"
  t = t.replace(/\s*:\s*(Electronics|Toys & Games|Home & Kitchen|Clothing.*|Books|Sports & Outdoors|Beauty|Video Games|Kitchen & Dining|Office Products)$/i, "");
  // keyword-stuffed marketplace titles: cut at the first natural break
  // "Apple AirPods Pro (2nd Gen) Wireless Earbuds, Up to 2X More…" → "Apple AirPods Pro (2nd Gen) Wireless Earbuds"
  if (t.length > 90) {
    const m = /^(.{25,}?)(?:,\s| with | \| | - | – | for )/i.exec(t);
    if (m && m[1].length <= 90) t = m[1];
  }
  return t.trim();
}

// Readable guess from the URL itself, for pages that block us:
// /Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH → "Sony WH 1000XM5 Canceling Headphones"
function titleFromUrl(url) {
  const path = String(url).replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  let best = "";
  for (let seg of path.split("/")) {
    try {
      seg = decodeURIComponent(seg);
    } catch (_) {}
    seg = seg.replace(/\.(html?|php|aspx?)$/i, "");
    const words = seg.split(/[-_+]+/).filter(Boolean);
    // skip ids and short structural segments like "dp", "p", "product"
    if (words.length < 2 || /^(dp|gp|p|product|products|item|ip|site|shop)$/i.test(seg)) continue;
    // keep words and short numbers ("AirPods Pro 2"), drop long ids
    const real = words.filter((w) => (/[a-z]/i.test(w) && !/^(?=.*\d)[A-Z0-9]{8,}$/i.test(w)) || /^\d{1,5}$/.test(w));
    if (real.filter((w) => /[a-z]/i.test(w)).length >= 2 && real.join(" ").length > best.length) best = real.join(" ");
  }
  if (!best) return "";
  return best.replace(/\b([a-z])/g, (c) => c.toUpperCase()).slice(0, 200);
}

const TRACKING = /^(utm_\w+|fbclid|gclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|ref|ref_|refRID|_encoding|psc|smid|pd_rd_\w+|pf_rd_\w+|content-id|qid|sr|sprefix|crid|keywords|dib|dib_tag|th|linkCode|tag|ascsubtag|irclickid|irgwc|clickid|cmpid|campaign|source|spm|scm|_branch_\w+|igshid|si)$/i;

// Remove tracking parameters (and Amazon's /ref=… path segment)
function cleanUrl(url) {
  const m = /^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(String(url || "").trim());
  if (!m) return url;
  let path = m[2].replace(/\/ref=[^/]*$/i, "");
  const query = (m[3] || "")
    .slice(1)
    .split("&")
    .filter((kv) => kv && !TRACKING.test(kv.split("=")[0]));
  return m[1] + path + (query.length ? "?" + query.join("&") : "");
}

// Detect captcha / bot-wall pages so we can say so instead of "no details found"
function blockedReason(html, status) {
  const h = String(html || "").slice(0, 200000);
  // real bot walls only; plenty of normal pages load reCAPTCHA scripts
  if (/Robot Check|validateCaptcha|captcha-delivery|px-captcha|are you a (human|robot)|verify you are (a )?human|cf-chl-|<title>\s*(Just a moment|Attention Required|Access Denied)|Pardon Our Interruption|unusual traffic from your/i.test(h)) {
    return "captcha";
  }
  if (status === 403 || status === 429 || status === 503) return "blocked";
  return "";
}

/**
 * Extract product details from a page.
 * Returns { title, description, image, images[], price, currency, brand, siteName, url }
 */
function extract(url, html) {
  html = String(html || "");
  const host = (/^https?:\/\/([^/:?#]+)/i.exec(url) || [])[1] || "";
  const out = { title: "", description: "", image: "", images: [], price: null, currency: "", brand: "", siteName: "", url: "" };
  let images = [];

  // 1) JSON-LD
  let product = null;
  for (const block of jsonLdBlocks(html)) {
    product = findProduct(block, 0);
    if (product) break;
  }
  if (product) {
    out.title = text(product.name);
    out.description = text(product.description);
    images = images.concat(imagesOf(product.image));
    if (!images.length && product.hasVariant) images = images.concat(imagesOf((first(product.hasVariant) || {}).image));
    const offer = offerOf(product);
    out.price = offer.price;
    out.currency = offer.currency;
    out.brand = text(product.brand || product.manufacturer);
  }

  // 2) store-specific
  if (/(^|\.)amazon\.[a-z.]+$/i.test(host)) {
    const a = amazon(html);
    out.title = out.title || a.title || "";
    if (a.images) images = a.images.concat(images);
    if (out.price == null && a.price != null) {
      out.price = a.price;
      out.currency = out.currency || a.currency || "";
    }
    out.brand = out.brand || a.brand || "";
  }

  // 3) Open Graph, Twitter, product meta, microdata
  out.siteName = meta(html, ["og:site_name", "application-name"]);
  if (!out.title) out.title = meta(html, ["og:title", "twitter:title"]);
  if (!out.description) out.description = meta(html, ["og:description", "description", "twitter:description"]);
  images = images.concat(metaAll(html, "og:image"), metaAll(html, "og:image:secure_url"));
  images.push(meta(html, ["og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnailUrl"]));
  images.push(linkHref(html, "image_src"));
  if (out.price == null) {
    const p = meta(html, ["product:price:amount", "og:price:amount", "product:sale_price:amount", "twitter:data1", "price"]);
    out.price = parsePrice(p);
    if (out.price != null) out.currency = out.currency || meta(html, ["product:price:currency", "og:price:currency", "priceCurrency"]).toUpperCase() || currencyFromText(p);
  }
  if (out.price == null) {
    // microdata on any element: itemprop="price" content="12.99"
    const m = /itemprop\s*=\s*["']price["'][^>]*?content\s*=\s*["']([^"']+)["']/i.exec(html) || /content\s*=\s*["']([^"']+)["'][^>]*?itemprop\s*=\s*["']price["']/i.exec(html);
    if (m) out.price = parsePrice(m[1]);
  }
  if (!out.currency) out.currency = meta(html, ["product:price:currency", "og:price:currency", "priceCurrency"]).toUpperCase();
  if (!out.brand) out.brand = meta(html, ["product:brand", "og:brand", "brand"]);

  // 4) prices in embedded app data (Walmart and other Next.js stores)
  if (out.price == null) {
    const m = /"(?:currentPrice|salePrice|finalPrice)"\s*:\s*\{[^{}]*?"(?:price|amount|value)"\s*:\s*"?(\d[\d.,]*)/i.exec(html);
    if (m) out.price = parsePrice(m[1]);
  }

  // 5) <title>
  if (!out.title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m) out.title = m[1];
  }
  out.title = cleanTitle(out.title, out.siteName, host).slice(0, 200);

  // Not obviously a product page (a redirect to a category, a maintenance page…)?
  // Then a generic title like "Products" or "Patagonia Outdoor Clothing" is worse
  // than the name in the link.
  const ogType = meta(html, ["og:type"]).toLowerCase();
  // (og:type "product.group" is a category page, not a product)
  const isProduct = !!product || /^(og:)?product(\.item)?$/.test(ogType) || out.price != null;
  const site = String(host).replace(/^www\./, "").split(".")[0].toLowerCase();
  const fromUrl = titleFromUrl(url);
  if (!isProduct && fromUrl && (out.title.length < 20 || out.title.toLowerCase().indexOf(site) >= 0)) {
    out.title = fromUrl;
    out.description = "";
  }

  // tidy description: no HTML, no "Buy X at Store. Free shipping…" boilerplate
  let d = decode(stripTags(out.description))
    .replace(/^Amazon\.[a-z.]+\s*:\s*/i, "")
    .replace(/\s+:\s+[A-Z][\w &,'-]{2,40}$/, ""); // Amazon's " : Electronics" category tail
  if (d && out.title && d.toLowerCase() === out.title.toLowerCase()) d = "";
  if (/^(buy|shop|discover|find|browse|order)\b/i.test(d) && /\bat\b|\bon\b|\bonline\b/i.test(d)) d = "";
  if (d.length > 400) d = d.slice(0, 400).replace(/\s+\S*$/, "") + "…";
  out.description = d;

  // images: absolute, https/http only, unique, skip sprites, logos and tracking pixels
  const seen = {};
  for (let img of images) {
    img = absolutize(url, decode(img));
    if (!img || !/^https?:\/\//i.test(img)) continue;
    if (/sprite|logo|favicon|pixel|spacer|blank\.gif|1x1|placeholder/i.test(img)) continue;
    const key = img.replace(/[?#].*$/, "");
    if (seen[key]) continue;
    seen[key] = true;
    out.images.push(img);
    if (out.images.length >= MAX_IMAGES) break;
  }
  out.image = out.images[0] || "";

  const canonical = absolutize(url, linkHref(html, "canonical") || meta(html, ["og:url"]));
  const canonHost = (/^https?:\/\/([^/:?#]+)/i.exec(canonical) || [])[1] || "";
  const sameSite = (a, b) => a.replace(/^www\./, "") === b.replace(/^www\./, "");
  // the canonical link drops tracking junk, but only trust it on a real product page
  out.url = cleanUrl(isProduct && canonical && sameSite(canonHost, host) ? canonical : url);
  if (out.brand && out.brand.length > 60) out.brand = "";
  return out;
}

module.exports = { extract, parsePrice, cleanUrl, titleFromUrl, blockedReason, decode };
